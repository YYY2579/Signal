import { create } from "zustand";

import { api } from "../lib/tauri";
import type { Article } from "../lib/types";

interface ArticlesState {
  articles: Article[];
  loading: boolean;
  activeSource: string | null; // null = 全部
  searchQuery: string;
  readingArticleId: string | null;
  loadArticles: () => Promise<void>;
  setActiveSource: (source: string | null) => void;
  setSearchQuery: (q: string) => void;
  openArticle: (id: string) => void;
  closeReader: () => void;
  refresh: () => Promise<void>;
}

export const useArticlesStore = create<ArticlesState>((set, get) => ({
  articles: [],
  loading: false,
  activeSource: null,
  searchQuery: "",
  readingArticleId: null,

  loadArticles: async () => {
    set({ loading: true });
    const { activeSource, searchQuery } = get();
    try {
      let articles: Article[];
      if (searchQuery) {
        articles = await api.searchArticles(searchQuery);
      } else {
        articles = await api.getArticles(activeSource ?? undefined, 100, 0);
      }
      set({ articles, loading: false });
    } catch (e) {
      console.error("loadArticles failed", e);
      set({ loading: false });
    }
  },

  setActiveSource: (source) => {
    set({ activeSource: source });
    get().loadArticles();
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    get().loadArticles();
  },

  openArticle: (id) => {
    set({ readingArticleId: id });
    api.markRead(id).then(() => get().loadArticles());
  },

  closeReader: () => set({ readingArticleId: null }),

  refresh: async () => {
    const { activeSource } = get();
    if (activeSource) {
      await api.refreshSource(activeSource);
    } else {
      await api.refreshAll();
    }
  },
}));
