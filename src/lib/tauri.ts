import { invoke } from "@tauri-apps/api/core";

import type {
  Article,
  ArticleFilter,
  FilterConfig,
  LoginConfig,
  SourceConfig,
  UnreadCounts,
} from "./types";

/** 后端命令封装（参数名 camelCase，Tauri 自动转 Rust snake_case） */
export const api = {
  getArticles: (
    source?: string,
    limit = 100,
    offset = 0,
    filter?: ArticleFilter,
  ) =>
    invoke<Article[]>("get_articles", { source, limit, offset, filter }),

  refreshSource: (source: string) =>
    invoke<void>("refresh_source", { source }),

  refreshAll: () => invoke<void>("refresh_all"),

  getArticleContent: (articleId: string) =>
    invoke<string | null>("get_article_content", { articleId }),

  getSources: () => invoke<SourceConfig[]>("get_sources"),

  updateSourceConfig: (configIn: SourceConfig) =>
    invoke<void>("update_source_config", { configIn }),

  searchArticles: (query: string) =>
    invoke<Article[]>("search_articles", { query }),

  markRead: (articleId: string) =>
    invoke<void>("mark_read", { articleId }),

  markAllRead: (source?: string) =>
    invoke<void>("mark_all_read", { source }),

  getUnreadCounts: () => invoke<UnreadCounts>("get_unread_counts"),

  updateFilter: (filter: FilterConfig) =>
    invoke<void>("update_filter", { filter }),

  updateLogin: (login: LoginConfig) =>
    invoke<void>("update_login", { login }),

  openArticleUrl: (url: string) =>
    invoke<void>("open_article_url", { url }),
};
