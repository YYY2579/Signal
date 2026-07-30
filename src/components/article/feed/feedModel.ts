import type { Article } from "../../../lib/types";
import type { ActiveView, SummaryStage } from "../../../stores/uiStore";

export type ReadFilter = "all" | "unread" | "read";

export interface FeedFilters {
  read: ReadFilter;
  source: string | null;
  bookmarked: boolean;
  readLater: boolean;
  knowledge: boolean;
}

export type FeedSort = "热度" | "最新" | "AI推荐";
export type { SummaryStage } from "../../../stores/uiStore";

export const SUMMARY_STAGES: Array<{ id: SummaryStage; label: string }> = [
  { id: "pending", label: "待生成" },
  { id: "draft", label: "待审核" },
  { id: "accepted", label: "已完成" },
];

export const DEFAULT_FEED_FILTERS: FeedFilters = {
  read: "all",
  source: null,
  bookmarked: false,
  readLater: false,
  knowledge: false,
};

export const VIEW_META: Record<
  ActiveView,
  { title: string; countLabel: string; emptyTitle: string; emptyDescription: string }
> = {
  dashboard: {
    title: "今日情报",
    countLabel: "条今日更新",
    emptyTitle: "今日还没有新情报",
    emptyDescription: "刷新已启用的数据源后会显示今日更新",
  },
  trending: {
    title: "热门趋势 Top 50",
    countLabel: "条跨源热点",
    emptyTitle: "暂无可排名热点",
    emptyDescription: "只有具备真实热度数据的条目会进入趋势榜",
  },
  subscriptions: {
    title: "订阅更新",
    countLabel: "条已订阅来源更新",
    emptyTitle: "订阅中暂无内容",
    emptyDescription: "在数据源设置中选择订阅来源并完成同步",
  },
  summary: {
    title: "AI 摘要工作台",
    countLabel: "条处理任务",
    emptyTitle: "当前队列为空",
    emptyDescription: "切换摘要阶段查看待生成、待审核或已完成内容",
  },
  later: {
    title: "稍后阅读",
    countLabel: "条稍后阅读",
    emptyTitle: "稍后阅读为空",
    emptyDescription: "在情报卡片上点击时钟图标即可加入",
  },
  knowledge: {
    title: "收藏知识库",
    countLabel: "条知识条目",
    emptyTitle: "知识库为空",
    emptyDescription: "将文章加入知识库后会显示在这里",
  },
};

export function countActiveFilters(filters: FeedFilters) {
  return (
    Number(filters.read !== "all") +
    Number(filters.source !== null) +
    Number(filters.bookmarked) +
    Number(filters.readLater) +
    Number(filters.knowledge)
  );
}

export function defaultSortForView(activeView: ActiveView): FeedSort {
  return activeView === "subscriptions" || activeView === "summary" ? "最新" : "热度";
}

export function applyFeedFilters(articles: Article[], filters: FeedFilters) {
  return articles.filter((article) => {
    if (filters.read === "read" && !article.is_read) return false;
    if (filters.read === "unread" && article.is_read) return false;
    if (filters.source && article.source !== filters.source) return false;
    if (filters.bookmarked && !article.is_bookmarked) return false;
    if (filters.readLater && !article.is_read_later) return false;
    if (filters.knowledge && !article.in_knowledge) return false;
    return true;
  });
}

export function sortFeedArticles(articles: Article[], sort: FeedSort) {
  if (sort === "最新") {
    return [...articles].sort((a, b) => b.published_at - a.published_at);
  }
  if (sort === "AI推荐") {
    return articles
      .filter((article) => typeof article.ai_score === "number")
      .sort(
        (a, b) =>
          (b.ai_score ?? 0) - (a.ai_score ?? 0) ||
          b.hot_score - a.hot_score ||
          b.published_at - a.published_at,
      );
  }
  return [...articles].sort(
    (a, b) => b.hot_score - a.hot_score || b.published_at - a.published_at,
  );
}
