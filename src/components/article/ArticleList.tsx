import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { api, isTauriRuntime } from "../../lib/tauri";
import { translate, type MessageKey } from "../../lib/i18n";
import { SOURCE_NAMES, type TrendingTopic } from "../../lib/types";
import { cn } from "../../lib/utils";
import { useArticlesStore } from "../../stores/articlesStore";
import { useSourcesStore } from "../../stores/sourcesStore";
import { useUiStore } from "../../stores/uiStore";
import { ArticleCard } from "./ArticleCard";
import { FeedFilterPopover } from "./feed/FeedFilterPopover";
import {
  applyFeedFilters,
  countActiveFilters,
  DEFAULT_FEED_FILTERS,
  defaultSortForView,
  SUMMARY_STAGES,
  sortFeedArticles,
  VIEW_META,
  type FeedFilters,
  type FeedSort,
} from "./feed/feedModel";

const tabs = ["热度", "最新", "AI推荐"] as const;
const tabIds: Record<(typeof tabs)[number], string> = {
  热度: "feed-sort-hot",
  最新: "feed-sort-latest",
  AI推荐: "feed-sort-ai",
};

export function ArticleList() {
  const articles = useArticlesStore((s) => s.articles);
  const loading = useArticlesStore((s) => s.loading);
  const loadError = useArticlesStore((s) => s.loadError);
  const loadArticles = useArticlesStore((s) => s.loadArticles);
  const searchQuery = useArticlesStore((s) => s.searchQuery);
  const activeSource = useArticlesStore((s) => s.activeSource);
  const readingArticleId = useArticlesStore((s) => s.readingArticleId);
  const setActiveSource = useArticlesStore((s) => s.setActiveSource);
  const sources = useSourcesStore((s) => s.sources);
  const activeView = useUiStore((s) => s.activeView);
  const summaryStage = useUiStore((s) => s.summaryStage);
  const setSummaryStage = useUiStore((s) => s.setSummaryStage);
  const openAiPanel = useUiStore((s) => s.openAiPanel);
  const locale = useUiStore((s) => s.locale);
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const [activeTab, setActiveTab] = useState<FeedSort>("热度");
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FEED_FILTERS);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const enabledSourceCount = sources.filter((source) => source.enabled).length;
  const subscribedSources = sources.filter((source) => source.subscribed);
  const subscriptionLoadKey =
    activeView === "subscriptions"
      ? subscribedSources
          .map((source) => source.id)
          .sort()
          .join(",")
      : "";
  const summaryLoadKey = activeView === "summary" ? summaryStage : "";

  const { filteredArticles, viewArticles } = useMemo(() => {
    const viewArticles = activeSource
      ? articles.filter((article) => article.source === activeSource)
      : articles;
    return {
      viewArticles,
      filteredArticles: applyFeedFilters(viewArticles, filters),
    };
  }, [activeSource, articles, filters]);

  const sortedArticles = useMemo(
    () => sortFeedArticles(filteredArticles, activeTab),
    [activeTab, filteredArticles],
  );

  useEffect(() => {
    setActiveTab(defaultSortForView(activeView));
  }, [activeView]);

  useEffect(() => {
    void loadArticles();
  }, [activeView, loadArticles, subscriptionLoadKey, summaryLoadKey]);

  useEffect(() => {
    if (activeView !== "trending" || activeSource || !isTauriRuntime()) return;
    setTrendingLoading(true);
    void api.getTrendingTopics().then(setTrendingTopics).catch((error) => console.error("load trending topics failed", error)).finally(() => setTrendingLoading(false));
  }, [activeSource, activeView, articles]);

  const aiRecommendationAvailable = viewArticles.some(
    (article) => typeof article.ai_score === "number",
  );

  useEffect(() => {
    if (activeTab === "AI推荐" && !aiRecommendationAvailable) {
      setActiveTab(defaultSortForView(activeView));
    }
  }, [activeTab, activeView, aiRecommendationAvailable]);

  const viewTitleKeys: Record<typeof activeView, MessageKey> = {
    dashboard: "feed.title.dashboard",
    trending: "feed.title.trending",
    subscriptions: "feed.title.subscriptions",
    summary: "feed.title.summary",
    later: "feed.title.later",
    knowledge: "feed.title.knowledge",
  };
  const viewMeta = { ...VIEW_META[activeView], title: t(viewTitleKeys[activeView]) };
  const activeFilterCount = countActiveFilters(filters);
  const activeSourceConfig = activeSource
    ? sources.find((source) => source.id === activeSource)
    : null;
  const activeSourceName = activeSource
    ? activeSourceConfig?.name ?? SOURCE_NAMES[activeSource] ?? activeSource
    : null;
  const heading = activeSourceName ?? viewMeta.title;
  const countLabel = activeSourceName ? "条来源情报" : viewMeta.countLabel;
  const summaryEmpty = {
    pending: [t("feed.empty.summaryPending"), t("feed.empty.summaryPendingDescription")],
    draft: [t("feed.empty.summaryDraft"), t("feed.empty.summaryDraftDescription")],
    accepted: [t("feed.empty.summaryAccepted"), t("feed.empty.summaryAcceptedDescription")],
  }[summaryStage];
  const emptyTitle = activeSourceName
    ? `${activeSourceName} 暂无情报`
    : activeView === "summary"
      ? summaryEmpty[0]
      : viewMeta.emptyTitle;
  const emptyDescription = activeSourceName
    ? activeSourceConfig?.enabled === false
      ? "该来源已停用，启用并同步后会显示新内容"
      : "刷新当前来源后，获取到的真实内容会显示在这里"
    : activeView === "summary"
      ? summaryEmpty[1]
    : viewMeta.emptyDescription;
  const connectionLabel = activeSourceName
    ? activeSourceConfig?.enabled === false
      ? "来源已停用 · 显示本地已存内容"
      : `当前来源 · ${activeSourceName}`
    : enabledSourceCount === 0
      ? t("feed.connection.waiting")
      : activeView === "dashboard"
        ? t("feed.connection.dashboard")
        : activeView === "trending"
          ? t("feed.connection.trending")
          : activeView === "subscriptions"
            ? t("feed.connection.subscriptions", { count: subscribedSources.length })
            : activeView === "summary"
              ? t("feed.connection.summary")
              : t("feed.connection.connected", { count: enabledSourceCount });

  const moveTabFocus = (currentIndex: number, direction: 1 | -1) => {
    for (let offset = 1; offset <= tabs.length; offset += 1) {
      const nextIndex = (currentIndex + direction * offset + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (nextTab === "AI推荐" && !aiRecommendationAvailable) continue;
      setActiveTab(nextTab);
      tabRefs.current[nextIndex]?.focus();
      return;
    }
  };

  return (
    <section className="flex w-[560px] shrink-0 flex-col border-r border-line bg-white">
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-line px-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="max-w-[210px] truncate text-[16px] font-bold text-ink" title={heading}>
              {heading}
            </h2>
            {!activeSource &&
              enabledSourceCount > 0 &&
              !loadError &&
              (activeView === "dashboard" || activeView === "trending") && (
                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-500">LIVE</span>
              )}
          </div>
          <p className="mt-1 text-[11px] text-faint">
            {connectionLabel}
          </p>
        </div>
        {activeView === "summary" && !activeSource ? (
          <button
            type="button"
            onClick={() => openAiPanel("summary")}
            className="flex h-8 items-center gap-1.5 rounded-btn bg-accent px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-accent-strong"
            title={
              readingArticleId ? t("feed.action.processCurrent") : t("feed.action.chooseArticle")
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            {readingArticleId ? t("feed.action.processCurrent") : t("feed.action.chooseArticle")}
          </button>
        ) : (
        <div className="flex items-center rounded-btn bg-panel p-1" role="tablist" aria-label={t("feed.sort.label")}>
          {tabs.map((tab, index) => {
            const disabled = tab === "AI推荐" && !aiRecommendationAvailable;
            return (
              <button
                key={tab}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveTabFocus(index, 1);
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveTabFocus(index, -1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    setActiveTab(tabs[0]);
                    tabRefs.current[0]?.focus();
                  } else if (event.key === "End") {
                    event.preventDefault();
                    const lastIndex = aiRecommendationAvailable ? tabs.length - 1 : tabs.length - 2;
                    setActiveTab(tabs[lastIndex]);
                    tabRefs.current[lastIndex]?.focus();
                  }
                }}
                type="button"
                role="tab"
                id={tabIds[tab]}
                aria-controls="feed-results"
                disabled={disabled}
                className={cn(
                  "h-7 rounded-[6px] px-2.5 text-[11px] font-semibold transition",
                  activeTab === tab
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:text-ink",
                  disabled && "cursor-not-allowed opacity-45 hover:text-muted",
                )}
                aria-selected={activeTab === tab}
                tabIndex={activeTab === tab ? 0 : -1}
                title={
                  tab === "AI推荐"
                    ? aiRecommendationAvailable
                      ? "按真实 AI 评分排序"
                      : "尚无真实 AI 评分"
                    : undefined
                }
              >
                {tab === "热度"
                  ? t("feed.sort.hot")
                  : tab === "最新"
                    ? t("feed.sort.latest")
                    : t("feed.sort.ai")}
              </button>
            );
          })}
        </div>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-line/70 px-5 py-2 text-[11px] text-faint">
        {activeView === "summary" && !activeSource ? (
          <div className="flex items-center rounded-btn bg-panel p-0.5" role="tablist" aria-label={t("feed.summaryStages")}>
            {SUMMARY_STAGES.map((stage) => (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={summaryStage === stage.id}
                onClick={() => setSummaryStage(stage.id)}
                className={cn(
                  "h-7 rounded-[6px] px-2 text-[10px] font-semibold transition",
                  summaryStage === stage.id
                    ? "bg-white text-accent shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {stage.id === "pending"
                  ? t("feed.stage.pending")
                  : stage.id === "draft"
                    ? t("feed.stage.draft")
                    : t("feed.stage.accepted")}
                {stage.id === summaryStage && (
                  <span className="ml-1 text-[9px] tabular-nums text-faint">
                    {sortedArticles.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
        <span className={loadError && articles.length > 0 ? "text-red-500" : undefined}>
          {loadError && articles.length > 0
            ? "更新失败 · "
            : loading && articles.length > 0
              ? "正在更新 · "
              : ""}
          {activeView === "trending" && !activeSource ? trendingTopics.length : sortedArticles.length} {countLabel}
          {loadError && articles.length > 0 && (
            <>
              <span className="sr-only">。{loadError}</span>
              <button
                type="button"
                onClick={() => void loadArticles()}
                className="ml-1 rounded px-1 font-semibold underline decoration-red-300 underline-offset-2 transition hover:text-red-700"
                aria-label="重新加载情报"
              >
                重试
              </button>
            </>
          )}
        </span>
        )}
        <FeedFilterPopover
          filters={filters}
          sources={sources}
          selectedSourceId={activeSource}
          onSourceChange={setActiveSource}
          onChange={setFilters}
        />
      </div>

      <div
        id="feed-results"
        role="tabpanel"
        aria-labelledby={activeView === "summary" ? undefined : tabIds[activeTab]}
        className="min-h-0 flex-1 overflow-y-auto bg-panel/40 px-5 py-4"
      >
        {(loading && articles.length === 0) || (trendingLoading && trendingTopics.length === 0) ? (
          <SkeletonList />
        ) : loadError && articles.length === 0 ? (
          <ErrorState message={loadError} locale={locale} onRetry={() => void loadArticles()} />
        ) : (activeView === "trending" && !activeSource ? trendingTopics.length === 0 : sortedArticles.length === 0) ? (
          <EmptyState
            searching={searchQuery.trim().length > 0}
            filtered={activeFilterCount > 0}
            title={emptyTitle}
            description={emptyDescription}
            locale={locale}
            onClearFilters={() => setFilters(DEFAULT_FEED_FILTERS)}
          />
        ) : activeView === "trending" && !activeSource ? (
          <div className="space-y-2" aria-live="polite">
            {trendingTopics.map((topic, index) => (
              <div key={`${topic.keywords[0]}-${topic.article.id}`} className="relative">
                <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] text-faint">
                  <span className="w-5 text-right font-bold tabular-nums text-accent">{String(index + 1).padStart(2, "0")}</span>
                  <span className="font-semibold text-ink-2">{topic.article_count} 篇相关内容</span>
                  {topic.keywords.map((keyword) => <span key={keyword} className="rounded bg-white px-1.5 py-0.5 text-[9px] text-muted ring-1 ring-line">{keyword}</span>)}
                </div>
                <ArticleCard article={topic.article} index={index} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3" aria-live="polite">
            {sortedArticles.map((article, index) => (
              <ArticleCard key={article.id} article={article} index={index} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-40 animate-pulse rounded-card border border-line bg-white p-4">
          <div className="mb-3 h-4 w-4/5 rounded bg-gray-100" />
          <div className="mb-4 h-3 w-2/5 rounded bg-gray-100" />
          <div className="mb-3 h-5 w-1/2 rounded bg-gray-100" />
          <div className="h-3 w-full rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  searching,
  filtered,
  title,
  description,
  locale,
  onClearFilters,
}: {
  searching: boolean;
  filtered: boolean;
  title: string;
  description: string;
  locale: "zh-CN" | "en-US";
  onClearFilters: () => void;
}) {
  const emptyTitle = searching
    ? translate(locale, "feed.empty.searchTitle")
    : filtered
        ? translate(locale, "feed.empty.filteredTitle")
        : title;
  const emptyDescription = searching
    ? translate(locale, "feed.empty.searchDescription")
    : filtered
        ? translate(locale, "feed.empty.filteredDescription")
        : description;

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-lg">S</div>
      <p className="text-sm font-semibold text-ink">
        {emptyTitle}
      </p>
      <p className="mt-1 max-w-[240px] text-xs leading-5 text-muted">
        {emptyDescription}
      </p>
      {filtered && !searching && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-3 h-8 rounded-btn border border-line bg-white px-3 text-[11px] font-semibold text-ink-2 transition hover:bg-panel"
        >
          {translate(locale, "feed.empty.clearFilters")}
        </button>
      )}
    </div>
  );
}

function ErrorState({
  message,
  locale,
  onRetry,
}: {
  message: string;
  locale: "zh-CN" | "en-US";
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center" role="alert">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-sm font-bold text-red-500">!</div>
      <p className="text-sm font-semibold text-ink">
        {translate(locale, "feed.error.title")}
      </p>
      <p className="mt-1 max-w-[300px] break-words text-xs leading-5 text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-8 rounded-btn bg-accent px-3 text-[11px] font-semibold text-white transition hover:bg-accent-strong"
      >
        {translate(locale, "feed.error.reload")}
      </button>
    </div>
  );
}
