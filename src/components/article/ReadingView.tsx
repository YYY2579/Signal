import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Bookmark,
  BrainCircuit,
  Clock3,
  ExternalLink,
  Eye,
  Flame,
  Inbox,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";

import { AiInsightPanel, type GenerationState } from "../ai/AiInsightPanel";
import { AiSendConfirmDialog } from "../ai/AiSendConfirmDialog";
import { AiSettingsDialog } from "../ai/AiSettingsDialog";
import { Button } from "../ui/button";
import { sanitizeHtml } from "../../lib/sanitize";
import { api, isTauriRuntime } from "../../lib/tauri";
import { translate } from "../../lib/i18n";
import { SOURCE_NAMES, type Article, type ArticleMindMap } from "../../lib/types";
import { formatRelativeTime } from "../../lib/utils";
import { useArticlesStore } from "../../stores/articlesStore";
import { useUiStore } from "../../stores/uiStore";
import { ArticleAnalyticsView, ArticleTrend } from "./reader/ArticleAnalyticsView";
import { KnowledgeDialog, NoteDialog } from "./reader/ArticleActionDialogs";
import { ConfirmDialog } from "./reader/ConfirmDialog";
import { ReaderMoreMenu } from "./reader/ReaderMoreMenu";
import {
  normalizeAiSettings,
  normalizeAnalytics,
  normalizeInsight,
  serializeInsight,
  validationError,
  type AiSettings,
  type ArticleAnalytics,
  type ArticleFlag,
  type ArticleInsight,
  type ReaderApi,
} from "./reader/types";

const readerApi = api as unknown as ReaderApi;
const ArticleMindMapDialog = lazy(() =>
  import("./reader/ArticleMindMapDialog").then((module) => ({
    default: module.ArticleMindMapDialog,
  })),
);

function isReadingArticle(articleId: string) {
  return useArticlesStore.getState().readingArticleId === articleId;
}

export function ReadingView() {
  const articles = useArticlesStore((state) => state.articles);
  const readingArticleId = useArticlesStore((state) => state.readingArticleId);
  const loadArticles = useArticlesStore((state) => state.loadArticles);
  const closeReader = useArticlesStore((state) => state.closeReader);
  const locale = useUiStore((state) => state.locale);
  const setStoredArticleFlag = useArticlesStore((state) => state.setArticleFlag);
  const article = articles.find((item) => item.id === readingArticleId);
  const bookmarked = article?.is_bookmarked ?? false;
  const readLater = article?.is_read_later ?? false;
  const inKnowledge = article?.in_knowledge ?? false;

  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ArticleAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [insight, setInsight] = useState<ArticleInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightReadError, setInsightReadError] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>("idle");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [flagBusy, setFlagBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiSettingsBusy, setAiSettingsBusy] = useState(false);
  const [aiSettingsError, setAiSettingsError] = useState<string | null>(null);
  const [continueAfterConfig, setContinueAfterConfig] = useState<"insight" | "mind-map" | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [deleteKeyConfirmOpen, setDeleteKeyConfirmOpen] = useState(false);
  const [mindMapOpen, setMindMapOpen] = useState(false);
  const [mindMap, setMindMap] = useState<ArticleMindMap | null>(null);
  const [mindMapLoading, setMindMapLoading] = useState(false);
  const [mindMapGenerating, setMindMapGenerating] = useState(false);
  const [mindMapError, setMindMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!article) {
      setContent(null);
      setContentLoading(false);
      setContentError(null);
      setAnalytics(null);
      setAnalyticsLoading(false);
      setAnalyticsError(null);
      setInsight(null);
      setInsightLoading(false);
      setInsightReadError(null);
      setGenerationState("idle");
      setGenerationError(null);
      setFlagBusy(false);
      setReviewBusy(false);
      setNoteBusy(false);
      setMoreOpen(false);
      setKnowledgeOpen(false);
      setNoteOpen(false);
      setAiSettingsOpen(false);
      setContinueAfterConfig(null);
      setSendConfirmOpen(false);
      setRejectConfirmOpen(false);
      setDeleteKeyConfirmOpen(false);
      setMindMapOpen(false);
      setMindMap(null);
      setMindMapLoading(false);
      setMindMapGenerating(false);
      setMindMapError(null);
      return;
    }

    let cancelled = false;
    setContent(article.content);
    setContentError(null);
    setAnalytics(null);
    setAnalyticsError(null);
    setInsight(null);
    setInsightReadError(null);
    setGenerationState("idle");
    setGenerationError(null);
    setFlagBusy(false);
    setReviewBusy(false);
    setNoteBusy(false);
    setReviewError(null);
    setMoreOpen(false);
    setKnowledgeOpen(false);
    setNoteOpen(false);
    setSendConfirmOpen(false);
    setRejectConfirmOpen(false);
    setMindMapOpen(false);
    setMindMap(null);
    setMindMapLoading(false);
    setMindMapGenerating(false);
    setMindMapError(null);

    if (!isTauriRuntime()) {
      setContentLoading(false);
      setAnalyticsLoading(false);
      setInsightLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setContentLoading(true);
    api
      .getArticleContent(article.id)
      .then((result) => {
        if (cancelled) return;
        setContent(result);
        void loadArticles();
      })
      .catch((error) => {
        if (!cancelled) setContentError(safeError(error, "正文加载失败"));
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });

    setInsightLoading(true);
    readerApi
      .getArticleInsight(article.id)
      .then((result) => {
        if (!cancelled) {
          setInsight(normalizeInsight(result, article.id));
          setInsightReadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) setInsightReadError(safeError(error, "AI Insight 读取失败"));
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });

    setAnalyticsLoading(true);
    readerApi
      .getArticleAnalytics(article.id)
      .then((result) => {
        if (!cancelled) setAnalytics(normalizeAnalytics(result));
      })
      .catch((error) => {
        if (!cancelled) setAnalyticsError(safeError(error, "分析数据加载失败"));
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [article?.id, loadArticles]);

  const refreshContent = useCallback(async () => {
    if (!article) return;
    const articleId = article.id;
    if (!isTauriRuntime()) {
      toast("正文仅在 Signal 桌面应用中抓取");
      return;
    }
    setContentLoading(true);
    setContentError(null);
    try {
      const result = await api.getArticleContent(articleId);
      if (!isReadingArticle(articleId)) return;
      setContent(result);
      if (!result) toast("正文尚未抓取完成，可以先打开原文");
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setContentError(safeError(error, "正文加载失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setContentLoading(false);
    }
  }, [article]);

  const refreshAnalytics = useCallback(async () => {
    if (!article) return;
    const articleId = article.id;
    if (!isTauriRuntime()) {
      toast("分析数据仅在 Signal 桌面应用中读取");
      return;
    }
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const result = normalizeAnalytics(await readerApi.getArticleAnalytics(articleId));
      if (isReadingArticle(articleId)) setAnalytics(result);
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setAnalyticsError(safeError(error, "分析数据加载失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setAnalyticsLoading(false);
    }
  }, [article]);

  const refreshInsight = useCallback(async () => {
    if (!article) return;
    const articleId = article.id;
    if (!isTauriRuntime()) {
      toast("AI Insight 仅在 Signal 桌面应用中读取");
      return;
    }
    setInsightLoading(true);
    setInsightReadError(null);
    try {
      const result = normalizeInsight(await readerApi.getArticleInsight(articleId), articleId);
      if (isReadingArticle(articleId)) setInsight(result);
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setInsightReadError(safeError(error, "AI Insight 读取失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setInsightLoading(false);
    }
  }, [article]);

  if (!article) return <ReaderEmptyState />;

  const sourceName = SOURCE_NAMES[article.source] ?? article.source;
  const aiScore = insight?.score ?? analytics?.ai_score ?? null;

  const openOriginal = () => {
    setMoreOpen(false);
    if (isTauriRuntime()) {
      api.openArticleUrl(article.url).catch((error) => {
        toast.error(safeError(error, "无法打开原文"));
      });
    } else {
      const opened = window.open(article.url, "_blank", "noopener,noreferrer");
      if (!opened) toast.error("浏览器阻止了新窗口，请允许弹窗后重试");
    }
  };

  const copyArticleLink = async () => {
    setMoreOpen(false);
    try {
      await navigator.clipboard.writeText(article.url);
      toast.success("文章链接已复制");
    } catch {
      toast.error("复制失败，请检查剪贴板权限");
    }
  };

  const updateFlag = async (flag: ArticleFlag, value: boolean) => {
    const articleId = article.id;
    setMoreOpen(false);
    setFlagBusy(true);
    try {
      const storeFlag =
        flag === "bookmarked"
          ? "is_bookmarked"
          : flag === "read_later"
            ? "is_read_later"
            : "in_knowledge";
      const saved = await setStoredArticleFlag(articleId, storeFlag, value);
      if (!saved && flag === "knowledge" && isReadingArticle(articleId)) {
        setKnowledgeError("知识库状态保存失败，请重试");
      }
      return saved;
    } finally {
      if (isReadingArticle(articleId)) setFlagBusy(false);
    }
  };

  const openAiConfiguration = async (
    resumeGeneration: "insight" | "mind-map" | null = null,
  ) => {
    setContinueAfterConfig(resumeGeneration);
    setAiSettingsOpen(true);
    setAiSettingsLoading(true);
    setAiSettingsError(null);
    setAiSettings(null);
    if (!isTauriRuntime()) {
      setAiSettingsLoading(false);
      setAiSettingsError("AI 配置需要在 Signal 桌面应用中完成");
      return;
    }
    try {
      setAiSettings(normalizeAiSettings(await readerApi.getAiSettings()));
    } catch (error) {
      setAiSettings(null);
      setAiSettingsError(safeError(error, "AI 设置读取失败"));
    } finally {
      setAiSettingsLoading(false);
    }
  };

  const prepareGeneration = async () => {
    if (!isTauriRuntime()) {
      toast("AI Insight 需要在 Signal 桌面应用中生成");
      return;
    }
    setGenerationError(null);
    try {
      const settings = normalizeAiSettings(await readerApi.getAiSettings());
      setAiSettings(settings);
      if (!settings.configured || !settings.model || !settings.base_url) {
        await openAiConfiguration("insight");
        return;
      }
      setSendConfirmOpen(true);
    } catch (error) {
      setGenerationError(safeError(error, "AI 设置读取失败"));
      await openAiConfiguration("insight");
    }
  };

  const saveAiConfiguration = async (
    nextSettings: Omit<AiSettings, "configured">,
    apiKey: string,
  ) => {
    setAiSettingsBusy(true);
    setAiSettingsError(null);
    try {
      await readerApi.updateAiSettings({
        provider: nextSettings.provider,
        base_url: nextSettings.base_url,
        model: nextSettings.model,
        require_review: nextSettings.require_review,
      });
      if (apiKey) await readerApi.setAiApiKey(apiKey, nextSettings.provider);
      const error = validationError(await readerApi.validateAiProvider());
      if (error) throw new Error(error);
      const saved = normalizeAiSettings(await readerApi.getAiSettings());
      setAiSettings(saved);
      setAiSettingsOpen(false);
      toast.success("AI 服务连接验证通过");
      if (continueAfterConfig === "insight") {
        setSendConfirmOpen(true);
      } else if (continueAfterConfig === "mind-map") {
        void generateMindMap();
      }
      setContinueAfterConfig(null);
    } catch (error) {
      setAiSettingsError(safeError(error, "AI 服务配置失败"));
    } finally {
      setAiSettingsBusy(false);
    }
  };

  const deleteAiKey = async () => {
    setDeleteKeyConfirmOpen(false);
    setAiSettingsBusy(true);
    setAiSettingsError(null);
    try {
      await readerApi.deleteAiApiKey(aiSettings?.provider ?? "openai-compatible");
      setAiSettings((current) => current ? { ...current, configured: false } : current);
      toast.success("API Key 已从系统凭据中移除");
    } catch (error) {
      setAiSettingsError(safeError(error, "API Key 移除失败"));
    } finally {
      setAiSettingsBusy(false);
    }
  };

  const generateInsight = async () => {
    const articleId = article.id;
    setSendConfirmOpen(false);
    setGenerationState("preparing");
    setGenerationError(null);
    const phaseTimer = window.setTimeout(() => {
      if (isReadingArticle(articleId)) setGenerationState("generating");
    }, 350);
    try {
      const generated = await readerApi.generateArticleInsight(articleId);
      let result = normalizeInsight(generated, articleId);
      if (!result) {
        result = normalizeInsight(await readerApi.getArticleInsight(articleId), articleId);
      }
      if (!result) throw new Error("模型未返回可审核的结构化结果");
      if (!isReadingArticle(articleId)) return;
      setInsight(result);
      setGenerationState("idle");
      await loadArticles();
      toast.success(
        result.status === "accepted"
          ? "AI Insight 已生成并保存"
          : "AI Insight 已生成，请审核结果",
      );
      void refreshAnalytics();
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setGenerationError(safeError(error, "AI Insight 生成失败"));
        setGenerationState("error");
      }
    } finally {
      window.clearTimeout(phaseTimer);
    }
  };

  const openMindMap = async () => {
    const articleId = article.id;
    setMindMapOpen(true);
    setMindMapError(null);
    if (mindMap || mindMapLoading || mindMapGenerating) return;
    if (!isTauriRuntime()) {
      setMindMapError("思维导图需要在 Signal 桌面应用中读取和生成");
      return;
    }
    setMindMapLoading(true);
    try {
      const saved = await api.getArticleMindMap(articleId);
      if (isReadingArticle(articleId)) setMindMap(saved);
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setMindMapError(safeError(error, "思维导图读取失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setMindMapLoading(false);
    }
  };

  const prepareMindMapGeneration = async () => {
    if (!isTauriRuntime()) {
      setMindMapError("思维导图需要在 Signal 桌面应用中生成");
      return;
    }
    setMindMapError(null);
    try {
      const settings = normalizeAiSettings(await readerApi.getAiSettings());
      setAiSettings(settings);
      if (!settings.configured || !settings.model || !settings.base_url) {
        await openAiConfiguration("mind-map");
        return;
      }
      await generateMindMap();
    } catch (error) {
      setMindMapError(safeError(error, "AI 设置读取失败"));
      await openAiConfiguration("mind-map");
    }
  };

  const generateMindMap = async () => {
    const articleId = article.id;
    setMindMapGenerating(true);
    setMindMapError(null);
    try {
      const generated = await api.generateArticleMindMap(articleId);
      if (!isReadingArticle(articleId)) return;
      setMindMap(generated);
      toast.success("文章思维导图已生成并保存到本机");
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setMindMapError(safeError(error, "思维导图生成失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setMindMapGenerating(false);
    }
  };

  const acceptInsight = async (edited: ArticleInsight) => {
    const articleId = article.id;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const response = await readerApi.reviewArticleInsight(
        articleId,
        "accept",
        serializeInsight(edited),
      );
      if (!isReadingArticle(articleId)) return;
      setInsight(normalizeInsight(response, articleId) ?? { ...edited, status: "accepted" });
      await loadArticles();
      toast.success("AI Insight 已接受并保存");
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setReviewError(safeError(error, "审核结果保存失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setReviewBusy(false);
    }
  };

  const rejectInsight = async () => {
    const articleId = article.id;
    setRejectConfirmOpen(false);
    setReviewBusy(true);
    setReviewError(null);
    try {
      const response = await readerApi.reviewArticleInsight(articleId, "reject");
      if (!isReadingArticle(articleId)) return;
      setInsight(normalizeInsight(response, articleId) ?? (insight ? { ...insight, status: "rejected" } : null));
      await loadArticles();
      toast.success("AI Insight 已拒绝");
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setReviewError(safeError(error, "审核结果保存失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setReviewBusy(false);
    }
  };

  const saveNote = async (title: string, noteContent: string) => {
    if (!isTauriRuntime()) {
      setNoteError("笔记需要在 Signal 桌面应用中保存");
      return;
    }
    const articleId = article.id;
    setNoteBusy(true);
    setNoteError(null);
    try {
      await readerApi.saveArticleNote(articleId, title, noteContent);
      const reloaded = await loadArticles();
      if (!isReadingArticle(articleId)) return;
      setNoteOpen(false);
      if (reloaded) {
        toast.success("笔记已保存并加入知识库");
      } else {
        toast("笔记已保存，知识库状态将在下次刷新时同步");
      }
    } catch (error) {
      if (isReadingArticle(articleId)) {
        setNoteError(safeError(error, "笔记保存失败"));
      }
    } finally {
      if (isReadingArticle(articleId)) setNoteBusy(false);
    }
  };

  return (
    <>
      <section className="reader-shell flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
            <span className="font-medium">当前文章</span>
            <span className="text-gray-300">/</span>
            <span className="max-w-[420px] truncate font-medium text-ink-2">{article.title}</span>
          </div>
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              disabled={flagBusy}
              onClick={() => void updateFlag("bookmarked", !bookmarked)}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-panel disabled:opacity-50 ${bookmarked ? "text-accent" : "text-faint hover:text-ink"}`}
              title={bookmarked ? "取消收藏" : "收藏"}
              aria-label={bookmarked ? "取消收藏" : "收藏"}
              aria-pressed={bookmarked}
            >
              {flagBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? "currentColor" : "none"} />}
            </button>
            <button
              type="button"
              data-reader-more-trigger
              onClick={() => setMoreOpen((value) => !value)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-panel hover:text-ink"
              title="更多操作"
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <ReaderMoreMenu
              open={moreOpen}
              bookmarked={bookmarked}
              readLater={readLater}
              busy={flagBusy}
              onClose={() => setMoreOpen(false)}
              onBookmark={() => void updateFlag("bookmarked", !bookmarked)}
              onReadLater={() => void updateFlag("read_later", !readLater)}
              onCopyLink={() => void copyArticleLink()}
              onOpenOriginal={openOriginal}
            />
            <button
              type="button"
              onClick={closeReader}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-panel hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              title={translate(locale, "reader.close")}
              aria-label={translate(locale, "reader.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="reader-content-layout px-7 py-7"
            >
              <main className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-md bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-600">{sourceName}</span>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted">
                    <Sparkles className="h-3 w-3" />
                    {insightStatusLabel(insight)}
                  </span>
                </div>

                <h1 className="max-w-[700px] text-[28px] font-bold leading-[1.22] text-ink">{article.title}</h1>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
                  {article.author && (
                    <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{article.author}</span>
                  )}
                  <span>{sourceName}</span>
                  <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatRelativeTime(article.published_at)}</span>
                </div>

                <div className="mt-6 grid grid-cols-4 divide-x divide-line rounded-card border border-line bg-panel/60 px-1 py-3 shadow-card">
                  <Metric icon={Eye} label="阅读量" value={analytics?.views == null ? "--" : formatMetric(analytics.views)} />
                  <Metric icon={MessageSquare} label="评论" value={article.comments_count == null ? "--" : formatMetric(article.comments_count)} />
                  <Metric icon={Flame} label="热度指数" value={article.hot_label || formatMetric(article.hot_score)} accent="orange" />
                  <Metric icon={Sparkles} label="AI 评分" value={aiScore == null ? "--" : aiScore.toFixed(1)} accent="violet" />
                </div>

                <ArticleTrend points={analytics?.trend ?? []} loading={analyticsLoading} error={analyticsError} onRetry={() => void refreshAnalytics()} />

                <article className="article-rich-text mt-8 max-w-[700px] text-[16px] leading-[1.8] text-ink-2">
                  {article.summary && (
                    <div className="mb-7 rounded-r-lg border-l-[3px] border-accent bg-indigo-50/60 px-5 py-4">
                      <p className="mb-1 text-[10px] font-semibold uppercase text-indigo-500">来源摘要</p>
                      <p className="mb-0 text-[15px] leading-7 text-indigo-950">{article.summary}</p>
                    </div>
                  )}

                  {contentLoading ? (
                    <div className="space-y-3 py-4" aria-label="正在加载正文">
                      {Array.from({ length: 7 }).map((_, index) => (
                        <div key={index} className="h-3 animate-pulse rounded bg-gray-100" style={{ width: `${94 - (index % 4) * 7}%` }} />
                      ))}
                    </div>
                  ) : contentError ? (
                    <InlineEmptyState title="正文加载失败" description={contentError} action="重试正文" onAction={() => void refreshContent()} />
                  ) : content ? (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
                  ) : (
                    <InlineEmptyState title="暂未缓存正文" description="可以打开原文阅读，或重新检查正文抓取结果。" action="重新检查" onAction={() => void refreshContent()} secondaryAction="打开原文" onSecondaryAction={openOriginal} />
                  )}
                </article>

                <ArticleAnalyticsView analytics={analytics} loading={analyticsLoading} error={analyticsError} onRetry={() => void refreshAnalytics()} />
              </main>

              <AiInsightPanel
                insight={insight}
                loading={insightLoading}
                loadError={insightReadError}
                generationState={generationState}
                generationError={generationError}
                reviewBusy={reviewBusy}
                reviewError={reviewError}
                onRetryLoad={() => void refreshInsight()}
                onConfigure={() => void openAiConfiguration(null)}
                onGenerate={() => void prepareGeneration()}
                onAccept={(edited) => void acceptInsight(edited)}
                onReject={() => setRejectConfirmOpen(true)}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="reader-toolbar flex h-16 shrink-0 items-center justify-between border-t border-line bg-white/95 px-5 shadow-toolbar backdrop-blur-sm">
          <p className="hidden text-[10px] text-faint 2xl:block">{content ? "正文已缓存" : "外部链接内容"}</p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="reader-toolbar-button w-9 px-0" title="思维导图" aria-label="思维导图" onClick={() => void openMindMap()}>
              <BrainCircuit className="h-3.5 w-3.5" /><span className="reader-toolbar-label">思维导图</span>
            </Button>
            <Button variant="outline" size="sm" className="reader-toolbar-button w-9 px-0" title="打开原文" aria-label="打开原文" onClick={openOriginal}>
              <ExternalLink className="h-3.5 w-3.5" /><span className="reader-toolbar-label">打开原文</span>
            </Button>
            <Button variant="outline" size="sm" className="reader-toolbar-button w-9 px-0" title={inKnowledge ? "已加入知识库" : "加入知识库"} aria-label={inKnowledge ? "已加入知识库" : "加入知识库"} onClick={() => { setKnowledgeError(null); setKnowledgeOpen(true); }}>
              <BookOpen className="h-3.5 w-3.5" /><span className="reader-toolbar-label">{inKnowledge ? "已加入知识库" : "加入知识库"}</span>
            </Button>
            <Button size="sm" className="reader-toolbar-button w-9 px-0" title="生成笔记" aria-label="生成笔记" onClick={() => { setNoteError(null); setNoteOpen(true); }}>
              <NotebookPen className="h-3.5 w-3.5" /><span className="reader-toolbar-label">生成笔记</span>
            </Button>
          </div>
        </div>
      </section>

      <KnowledgeDialog
        open={knowledgeOpen}
        articleTitle={article.title}
        sourceName={sourceName}
        saved={inKnowledge}
        busy={flagBusy}
        error={knowledgeError}
        onClose={() => setKnowledgeOpen(false)}
        onConfirm={() => void updateFlag("knowledge", !inKnowledge).then((saved) => { if (saved) setKnowledgeOpen(false); })}
      />
      <NoteDialog
        open={noteOpen}
        articleTitle={article.title}
        suggestedContent={buildNoteContent(article, insight)}
        busy={noteBusy}
        error={noteError}
        onClose={() => setNoteOpen(false)}
        onSave={(title, noteContent) => void saveNote(title, noteContent)}
      />
      {mindMapOpen && (
        <Suspense fallback={null}>
          <ArticleMindMapDialog
            open
            articleTitle={article.title}
            mindMap={mindMap}
            loading={mindMapLoading}
            generating={mindMapGenerating}
            error={mindMapError}
            onClose={() => setMindMapOpen(false)}
            onGenerate={() => void prepareMindMapGeneration()}
            onConfigure={() => void openAiConfiguration(null)}
          />
        </Suspense>
      )}
      <AiSettingsDialog
        open={aiSettingsOpen}
        settings={aiSettings}
        loading={aiSettingsLoading}
        busy={aiSettingsBusy}
        error={aiSettingsError}
        onClose={() => { setAiSettingsOpen(false); setContinueAfterConfig(null); }}
        onSave={(settings, apiKey) => void saveAiConfiguration(settings, apiKey)}
        onDeleteKey={() => setDeleteKeyConfirmOpen(true)}
        onRetry={() => void openAiConfiguration(continueAfterConfig)}
      />
      <AiSendConfirmDialog
        open={sendConfirmOpen}
        articleTitle={article.title}
        sourceName={sourceName}
        hasSummary={Boolean(article.summary)}
        hasContent={Boolean(content)}
        onClose={() => setSendConfirmOpen(false)}
        onConfirm={() => void generateInsight()}
      />
      <ConfirmDialog
        open={rejectConfirmOpen}
        title="拒绝这份 AI Insight？"
        description="拒绝状态会保存，并阻止这份结果进入知识库或笔记。"
        confirmLabel="确认拒绝"
        busy={reviewBusy}
        danger
        onClose={() => setRejectConfirmOpen(false)}
        onConfirm={() => void rejectInsight()}
      />
      <ConfirmDialog
        open={deleteKeyConfirmOpen}
        title="移除 API Key？"
        description="移除后 AI 生成会暂停，重新配置密钥后才能继续。"
        confirmLabel="确认移除"
        busy={aiSettingsBusy}
        danger
        onClose={() => setDeleteKeyConfirmOpen(false)}
        onConfirm={() => void deleteAiKey()}
      />
    </>
  );
}

function ReaderEmptyState() {
  const locale = useUiStore((state) => state.locale);
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="h-11 shrink-0 border-b border-line" />
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-card border border-line bg-panel text-faint"><Inbox className="h-5 w-5" /></span>
          <h2 className="mt-4 text-[15px] font-semibold text-ink">
            {translate(locale, "reader.empty.title")}
          </h2>
          <p className="mt-2 max-w-[320px] text-[12px] leading-5 text-muted">
            {translate(locale, "reader.empty.description")}
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  accent?: "orange" | "violet";
}) {
  const color = accent === "orange" ? "text-orange-500" : accent === "violet" ? "text-violet-500" : "text-faint";
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 px-2">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="truncate text-[9px] text-faint">{label}</p>
        <p className="mt-0.5 text-[12px] font-bold tabular-nums text-ink">{value}</p>
      </div>
    </div>
  );
}

function InlineEmptyState({
  title,
  description,
  action,
  secondaryAction,
  onAction,
  onSecondaryAction,
}: {
  title: string;
  description: string;
  action: string;
  secondaryAction?: string;
  onAction: () => void;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-panel/60 px-5 py-7 text-center">
      <p className="mb-1 text-[13px] font-semibold text-ink">{title}</p>
      <p className="mb-0 text-[11px] leading-5 text-muted">{description}</p>
      <div className="mt-3 flex justify-center gap-2">
        {onSecondaryAction && <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={onSecondaryAction}>{secondaryAction}</Button>}
        <Button variant="outline" size="sm" className="h-8 bg-white text-[11px]" onClick={onAction}>{action}</Button>
      </div>
    </div>
  );
}

function buildNoteContent(article: Article, insight: ArticleInsight | null) {
  if (insight && insight.status !== "rejected") {
    const sections = [
      insight.summary && `## 摘要\n\n${insight.summary}`,
      insight.key_points.length && `## 核心观点\n\n${insight.key_points.map((item) => `- ${item}`).join("\n")}`,
      insight.impact_analysis && `## 影响分析\n\n${insight.impact_analysis}`,
      insight.technologies.length && `## 相关技术\n\n${insight.technologies.map((item) => `- ${item}`).join("\n")}`,
    ].filter(Boolean);
    return sections.join("\n\n");
  }
  return article.summary ? `## 来源摘要\n\n${article.summary}` : "";
}

function insightStatusLabel(insight: ArticleInsight | null) {
  if (!insight) return "尚未生成 AI 分析";
  if (insight.status === "accepted") return "AI 分析已审核";
  if (insight.status === "rejected") return "AI 分析已拒绝";
  if (insight.status === "failed") return "AI 分析生成失败";
  if (insight.status === "generating") return "AI 分析生成中";
  return "AI 分析待审核";
}

function safeError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  return message.replace(/\b(sk|key)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]") || fallback;
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
