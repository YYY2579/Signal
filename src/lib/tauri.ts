import { invoke } from "@tauri-apps/api/core";

import type {
  Article,
  ArticleAnalytics,
  ArticleInsight,
  ArticleMindMap,
  ArticleFilter,
  AiPreferences,
  AiSearchResponse,
  AiSettings,
  AiValidation,
  AppConfig,
  FilterConfig,
  LoginConfig,
  SourceConfig,
  TrendingTopic,
  UnreadCounts,
} from "./types";

export const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

/** 后端命令封装（参数名 camelCase，Tauri 自动转 Rust snake_case） */
export const api = {
  getArticles: (
    source?: string,
    limit = 100,
    offset = 0,
    filter?: ArticleFilter,
  ) =>
    invoke<Article[]>("get_articles", { source, limit, offset, filter }),

  getWorkspaceArticles: (
    view:
      | "dashboard"
      | "trending"
      | "subscriptions"
      | "summary"
      | "later"
      | "knowledge",
    source?: string,
    summaryStage?: "pending" | "draft" | "accepted",
  ) =>
    invoke<Article[]>("get_workspace_articles", {
      view,
      source,
      summaryStage,
    }),

  refreshSource: (source: string) =>
    invoke<void>("refresh_source", { source }),

  refreshAll: () => invoke<void>("refresh_all"),

  getArticleContent: (articleId: string) =>
    invoke<string | null>("get_article_content", { articleId }),

  getSources: () => invoke<SourceConfig[]>("get_sources"),
  addCustomSource: (name: string, url: string) => invoke<SourceConfig>("add_custom_source", { name, url }),
  removeCustomSource: (id: string) => invoke<void>("remove_custom_source", { id }),
  getTrendingTopics: () => invoke<TrendingTopic[]>("get_trending_topics"),

  getConfig: () => invoke<AppConfig>("get_config"),

  updateSourceConfig: (configIn: SourceConfig) =>
    invoke<void>("update_source_config", { configIn }),

  searchArticles: (query: string) =>
    invoke<Article[]>("search_articles", { query }),

  markRead: (articleId: string) =>
    invoke<void>("mark_read", { articleId }),

  recordArticleView: (articleId: string) =>
    invoke<void>("record_article_view", { articleId }),

  markUnread: (articleId: string) =>
    invoke<void>("mark_unread", { articleId }),

  setArticleFlag: (
    articleId: string,
    flag:
      | "is_read"
      | "is_bookmarked"
      | "is_read_later"
      | "in_knowledge"
      | "bookmarked"
      | "read_later"
      | "knowledge",
    value: boolean,
  ) => invoke<void>("set_article_flag", { articleId, flag, value }),

  saveArticleNote: (articleId: string, title: string, content: string) =>
    invoke<void>("save_article_note", { articleId, title, content }),

  markAllRead: (source?: string) =>
    invoke<void>("mark_all_read", { source }),

  getUnreadCounts: () => invoke<UnreadCounts>("get_unread_counts"),

  getArticleInsight: (articleId: string) =>
    invoke<ArticleInsight | null>("get_article_insight", { articleId }),

  generateArticleInsight: (articleId: string) =>
    invoke<ArticleInsight>("generate_article_insight", { articleId }),

  getArticleMindMap: (articleId: string) =>
    invoke<ArticleMindMap | null>("get_article_mind_map", { articleId }),

  generateArticleMindMap: (articleId: string) =>
    invoke<ArticleMindMap>("generate_article_mind_map", { articleId }),

  reviewArticleInsight: (
    articleId: string,
    action: "accept" | "reject",
    editedContent?: string,
  ) =>
    invoke<ArticleInsight>("review_article_insight", {
      articleId,
      action,
      editedContent,
    }),

  getArticleAnalytics: (articleId: string) =>
    invoke<ArticleAnalytics>("get_article_analytics", { articleId }),

  getAiSettings: () => invoke<AiSettings>("get_ai_settings"),

  updateAiSettings: (settings: AiPreferences) =>
    invoke<void>("update_ai_settings", { settings }),

  setAiApiKey: (key: string, provider: string) =>
    invoke<void>("set_ai_api_key", { provider, key }),

  deleteAiApiKey: (provider: string) =>
    invoke<void>("delete_ai_api_key", { provider }),

  validateAiProvider: () => invoke<AiValidation>("validate_ai_provider"),

  aiSearch: (query: string) => invoke<AiSearchResponse>("ai_search", { query }),

  updateFilter: (filter: FilterConfig) =>
    invoke<void>("update_filter", { filter }),

  updateLogin: (login: LoginConfig) =>
    invoke<void>("update_login", { login }),

  openArticleUrl: (url: string) =>
    invoke<void>("open_article_url", { url }),
};
