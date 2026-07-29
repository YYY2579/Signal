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
}

export interface SourceConfig {
  id: string;
  name: string;
  enabled: boolean;
  interval_minutes: number;
}

export interface FilterConfig {
  blacklist: string[];
  whitelist: string[];
}

export interface LoginConfig {
  juejin: string | null;
  zhihu: string | null;
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
  v2ex: "#1a1a1a",
  juejin: "#1e80ff",
  zhihu: "#0084ff",
};

/** 数据源显示名 */
export const SOURCE_NAMES: Record<string, string> = {
  hackernews: "Hacker News",
  v2ex: "V2EX",
  juejin: "掘金",
  zhihu: "知乎",
};
