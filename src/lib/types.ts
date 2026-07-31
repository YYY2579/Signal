// 与 Rust src-tauri/src/models.rs 对齐（snake_case 保持一致，避免转换）

export interface Article {
  id: string;
  source: string;
  native_id: string;
  title: string;
  url: string;
  summary: string;
  content: string | null;
  author: string | null;
  hot_score: number;
  hot_label: string;
  comments_count: number | null;
  published_at: number;
  fetched_at: number;
  thumbnail: string | null;
  is_read: boolean;
  has_content: boolean;
  is_bookmarked: boolean;
  is_read_later: boolean;
  in_knowledge: boolean;
  ai_status: string | null;
  ai_summary: string | null;
  ai_score: number | null;
}

export interface SourceConfig {
  id: string;
  name: string;
  enabled: boolean;
  subscribed: boolean;
  interval_minutes: number;
  feed_url?: string | null;
  platform?: string | null;
  icon?: string | null;
}

export interface TrendingTopic {
  title: string;
  keywords: string[];
  article_count: number;
  article: Article;
}

export interface FilterConfig {
  blacklist: string[];
  whitelist: string[];
}

export interface LoginConfig {
  juejin: string | null;
  zhihu: string | null;
}

export interface AppConfig {
  sources: SourceConfig[];
  filters: FilterConfig;
  login: LoginConfig;
  prefetch_content: boolean;
  ai: AiPreferences;
}

export interface AiPreferences {
  provider: string;
  base_url: string;
  model: string;
  require_review: boolean;
}

export interface AiSettings extends AiPreferences {
  configured: boolean;
}

export interface AiValidation {
  valid: boolean;
  message?: string | null;
}

export interface AiSearchResponse {
  answer: string;
  articles: Article[];
  local_candidate_count: number;
  cited_article_count: number;
  answer_scope: "local+model" | "model-only";
  freshness_notice: string;
}

export interface MindMapNode {
  id: string;
  label: string;
  detail: string;
  kind: string;
}

export interface MindMapEdge {
  source: string;
  target: string;
  label: string;
}

export interface ArticleMindMap {
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  updated_at: number;
}

export interface RelatedReading {
  title: string;
  url?: string | null;
}

export type InsightStatus = "draft" | "accepted" | "rejected" | "generating" | "failed";

export interface ArticleInsight {
  status: InsightStatus;
  summary: string;
  key_points: string[];
  impact_analysis: string;
  technologies: string[];
  related_reading: RelatedReading[];
  score?: number | null;
  error?: string | null;
  updated_at?: number | null;
}

export interface TrendPoint {
  timestamp: number;
  value: number;
}

export interface LabelValue {
  label: string;
  value: number;
}

export interface ArticleAnalytics {
  view_count?: number | null;
  ai_score?: number | null;
  trend: TrendPoint[];
  keywords: LabelValue[];
  domains: LabelValue[];
}

export interface ArticleFilter {
  blacklist: string[];
  whitelist: string[];
}

export interface UnreadCounts {
  [source: string]: number;
}

/** 数据源品牌色（与设计 tokens 对齐） */
export const SOURCE_COLORS: Record<string, string> = {
  hackernews: "#ff6600",
  github: "#24292f",
  v2ex: "#1a1a1a",
  juejin: "#1e80ff",
  zhihu: "#0084ff",
  csdn: "#dc2626",
  leetcode: "#f59e0b",
  reddit: "#ff4500",
  rustblog: "#111827",
  producthunt: "#da552f",
  rss: "#64748b",
  segmentfault: "#009a61",
  oschina: "#21b351",
  cnblogs: "#2563eb",
  rubychina: "#b91c1c",
  infoq: "#ef4444",
  devto: "#111827",
  lobsters: "#ac130d",
  rust: "#b7410e",
  python: "#3776ab",
  golang: "#00add8",
};

/** 数据源显示名 */
export const SOURCE_NAMES: Record<string, string> = {
  hackernews: "Hacker News",
  github: "GitHub Trending",
  v2ex: "V2EX",
  juejin: "掘金",
  zhihu: "知乎热榜",
  csdn: "CSDN 热榜",
  leetcode: "力扣讨论",
  reddit: "Reddit · r/programming",
  rustblog: "Rust 官方博客",
  producthunt: "Product Hunt",
};
