import { create } from "zustand";
import toast from "react-hot-toast";

import { api } from "../lib/tauri";
import { isTauriRuntime } from "../lib/tauri";
import type { Article } from "../lib/types";
import { useSourcesStore } from "./sourcesStore";
import { useUiStore } from "./uiStore";

export type PersistedArticleFlag =
  | "is_read"
  | "is_bookmarked"
  | "is_read_later"
  | "in_knowledge";

interface FlagUpdateOptions {
  announce?: boolean;
}

interface ArticlesState {
  articles: Article[];
  loading: boolean;
  loadError: string | null;
  pendingFlags: Record<string, boolean>;
  activeSource: string | null; // null = 全部
  searchQuery: string;
  readingArticleId: string | null;
  loadArticles: () => Promise<boolean>;
  setActiveSource: (source: string | null) => void;
  setSearchQuery: (q: string) => void;
  clearSearch: () => void;
  openArticle: (id: string) => void;
  openArticleResult: (article: Article) => void;
  closeReader: () => void;
  setArticleFlag: (
    articleId: string,
    flag: PersistedArticleFlag,
    value: boolean,
    options?: FlagUpdateOptions,
  ) => Promise<boolean>;
  refresh: () => Promise<boolean>;
}

let latestLoad = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
const flagOverrides = new Map<
  string,
  { articleId: string; flag: PersistedArticleFlag; value: boolean }
>();

function updateFlag(
  articles: Article[],
  articleId: string,
  flag: PersistedArticleFlag,
  value: boolean,
) {
  return articles.map((article) =>
    article.id === articleId ? ({ ...article, [flag]: value } as Article) : article,
  );
}

function applyFlagOverrides(articles: Article[]) {
  return articles.map((article) => {
    let next = article;
    for (const [key, override] of flagOverrides) {
      if (override.articleId !== article.id) continue;
      if (article[override.flag] === override.value) {
        flagOverrides.delete(key);
      } else {
        next = { ...next, [override.flag]: override.value } as Article;
      }
    }
    return next;
  });
}

function flagMessage(flag: PersistedArticleFlag, value: boolean) {
  const messages: Record<PersistedArticleFlag, [string, string]> = {
    is_read: ["已标记为未读", "已标记为已读"],
    is_bookmarked: ["已取消收藏", "已收藏"],
    is_read_later: ["已移出稍后阅读", "已加入稍后阅读"],
    in_knowledge: ["已移出知识库", "已加入知识库"],
  };
  return messages[flag][value ? 1 : 0];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function persistFlag(
  articleId: string,
  flag: PersistedArticleFlag,
  value: boolean,
) {
  if (flag === "is_read") {
    return value ? api.markRead(articleId) : api.markUnread(articleId);
  }
  const flagMap: Record<
    Exclude<PersistedArticleFlag, "is_read">,
    "bookmarked" | "read_later" | "knowledge"
  > = {
    is_bookmarked: "bookmarked",
    is_read_later: "read_later",
    in_knowledge: "knowledge",
  };
  return api.setArticleFlag(articleId, flagMap[flag], value);
}

export const useArticlesStore = create<ArticlesState>((set, get) => ({
  articles: [],
  loading: false,
  loadError: null,
  pendingFlags: {},
  activeSource: null,
  searchQuery: "",
  readingArticleId: null,

  loadArticles: async () => {
    const loadId = ++latestLoad;
    set({ loading: true, loadError: null });
    const { activeSource, searchQuery } = get();
    const { activeView, summaryStage } = useUiStore.getState();
    const normalizedSearchQuery = searchQuery.trim();
    if (!isTauriRuntime()) {
      set({ articles: [], loading: false, loadError: null });
      return true;
    }
    try {
      let articles: Article[];
      if (normalizedSearchQuery) {
        articles = await api.searchArticles(normalizedSearchQuery);
      } else {
        articles = await api.getWorkspaceArticles(
          activeView,
          activeSource ?? undefined,
          activeView === "summary" ? summaryStage : undefined,
        );
      }
      if (loadId === latestLoad) {
        const nextArticles = applyFlagOverrides(articles);
        set((state) => ({
          articles: nextArticles,
          loading: false,
          loadError: null,
          readingArticleId:
            state.readingArticleId &&
            nextArticles.some((article) => article.id === state.readingArticleId)
              ? state.readingArticleId
              : null,
        }));
        return true;
      }
      return false;
    } catch (e) {
      console.error("loadArticles failed", e);
      if (loadId === latestLoad) {
        set({ loading: false, loadError: `加载情报失败：${errorMessage(e)}` });
      }
      return false;
    }
  },

  setActiveSource: (source) => {
    set({ activeSource: source });
    get().loadArticles();
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => get().loadArticles(), 250);
  },

  clearSearch: () => {
    // A pending debounced search must never replace the destination selected by navigation.
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    latestLoad += 1;
    set({ searchQuery: "" });
  },

  openArticle: (id) => {
    const state = get();
    if (state.readingArticleId === id) return;
    const article = state.articles.find((item) => item.id === id);
    set({ readingArticleId: id });
    if (!article || !isTauriRuntime()) return;

    const pendingKey = `${id}:is_read`;
    const wasRead = article.is_read;
    if (!wasRead) flagOverrides.set(pendingKey, { articleId: id, flag: "is_read", value: true });
    set((current) => ({
      articles: wasRead ? current.articles : updateFlag(current.articles, id, "is_read", true),
      pendingFlags: { ...current.pendingFlags, [pendingKey]: true },
    }));

    void api
      .recordArticleView(id)
      .then(() => {
        flagOverrides.delete(pendingKey);
        set((current) => {
          const pendingFlags = { ...current.pendingFlags };
          delete pendingFlags[pendingKey];
          return { pendingFlags };
        });
        if (!wasRead) void useSourcesStore.getState().loadUnread();
      })
      .catch((error) => {
        flagOverrides.delete(pendingKey);
        set((current) => {
          const pendingFlags = { ...current.pendingFlags };
          delete pendingFlags[pendingKey];
          return {
            articles: wasRead ? current.articles : updateFlag(current.articles, id, "is_read", false),
            pendingFlags,
          };
        });
        toast.error(`记录阅读失败：${errorMessage(error)}`);
      });
  },

  openArticleResult: (article) => {
    set((state) => ({
      articles: state.articles.some((item) => item.id === article.id)
        ? state.articles
        : [article, ...state.articles],
    }));
    get().openArticle(article.id);
  },

  closeReader: () => set({ readingArticleId: null }),

  setArticleFlag: async (articleId, flag, value, options) => {
    const pendingKey = `${articleId}:${flag}`;
    if (get().pendingFlags[pendingKey]) return false;

    const article = get().articles.find((item) => item.id === articleId);
    if (!article) return false;
    if (article[flag] === value) return true;
    const previousValue = article[flag];
    flagOverrides.set(pendingKey, { articleId, flag, value });

    set((state) => ({
      articles: updateFlag(state.articles, articleId, flag, value),
      pendingFlags: { ...state.pendingFlags, [pendingKey]: true },
    }));

    try {
      if (!isTauriRuntime()) throw new Error("桌面数据库不可用");
      await persistFlag(articleId, flag, value);
      set((state) => {
        const pendingFlags = { ...state.pendingFlags };
        delete pendingFlags[pendingKey];
        return { pendingFlags };
      });
      if (flag === "is_read") void useSourcesStore.getState().loadUnread();
      if (options?.announce !== false) toast.success(flagMessage(flag, value));
      return true;
    } catch (error) {
      console.error("setArticleFlag failed", error);
      flagOverrides.delete(pendingKey);
      set((state) => {
        const pendingFlags = { ...state.pendingFlags };
        delete pendingFlags[pendingKey];
        return {
          articles: updateFlag(state.articles, articleId, flag, previousValue),
          pendingFlags,
        };
      });
      toast.error(`保存失败：${errorMessage(error)}`);
      return false;
    }
  },

  refresh: async () => {
    if (!isTauriRuntime()) return false;
    const { activeSource } = get();
    if (activeSource) {
      await api.refreshSource(activeSource);
    } else {
      await api.refreshAll();
    }
    return true;
  },
}));
