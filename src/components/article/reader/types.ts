export type ArticleFlag = "bookmarked" | "read_later" | "knowledge";

export interface AiSettings {
  provider: string;
  base_url: string;
  model: string;
  configured: boolean;
  require_review: boolean;
}

export type AiInsightStatus = "draft" | "accepted" | "rejected" | "generating" | "failed";

export interface RelatedReading {
  title: string;
  url?: string;
}

export interface ArticleInsight {
  article_id: string;
  status: AiInsightStatus;
  summary: string;
  key_points: string[];
  impact_analysis: string;
  technologies: string[];
  related_reading: RelatedReading[];
  score: number | null;
  error: string | null;
  updated_at: number | null;
}

export interface TrendPoint {
  timestamp: number;
  value: number;
}

export interface AnalyticsItem {
  name: string;
  value: number;
}

export interface ArticleAnalytics {
  views: number | null;
  ai_score: number | null;
  trend: TrendPoint[];
  keywords: AnalyticsItem[];
  domains: AnalyticsItem[];
  updated_at: number | null;
}

export interface ReaderApi {
  getAiSettings: () => Promise<unknown>;
  updateAiSettings: (settings: {
    provider: string;
    base_url: string;
    model: string;
    require_review: boolean;
  }) => Promise<void>;
  setAiApiKey: (apiKey: string, provider: string) => Promise<void>;
  deleteAiApiKey: (provider: string) => Promise<void>;
  validateAiProvider: () => Promise<unknown>;
  generateArticleInsight: (articleId: string) => Promise<unknown>;
  getArticleInsight: (articleId: string) => Promise<unknown>;
  reviewArticleInsight: (
    articleId: string,
    action: "accept" | "reject",
    editedContent?: string,
  ) => Promise<unknown>;
  setArticleFlag: (
    articleId: string,
    flag: ArticleFlag,
    value: boolean,
  ) => Promise<void>;
  saveArticleNote: (articleId: string, title: string, content: string) => Promise<void>;
  getArticleAnalytics: (articleId: string) => Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const input = asRecord(value);
  return {
    provider: asString(input.provider) || "openai-compatible",
    base_url: asString(input.base_url ?? input.baseUrl),
    model: asString(input.model),
    configured: Boolean(input.configured ?? input.has_api_key ?? input.hasApiKey),
    require_review: input.require_review !== false && input.requireReview !== false,
  };
}

export function validationError(value: unknown): string | null {
  if (value === true || value == null) return null;
  if (value === false) return "模型服务验证失败";
  const input = asRecord(value);
  if (input.valid === true || input.success === true) return null;
  return asString(input.message ?? input.error) || "模型服务验证失败";
}

export function normalizeInsight(value: unknown, articleId: string): ArticleInsight | null {
  if (!value) return null;
  const input = asRecord(value);
  const nested = asRecord(input.content ?? input.insight);
  const data = Object.keys(nested).length ? { ...input, ...nested } : input;
  const rawStatus = asString(data.status);
  const status: AiInsightStatus =
    rawStatus === "accepted" ||
    rawStatus === "rejected" ||
    rawStatus === "generating" ||
    rawStatus === "failed"
      ? rawStatus
      : "draft";
  const relatedRaw = data.related_reading ?? data.relatedReading;
  const related_reading = Array.isArray(relatedRaw)
    ? relatedRaw
        .map((item) => {
          if (typeof item === "string") return { title: item.trim() };
          const record = asRecord(item);
          return { title: asString(record.title), url: asString(record.url) || undefined };
        })
        .filter((item) => item.title)
    : [];

  return {
    article_id: asString(data.article_id ?? data.articleId) || articleId,
    status,
    summary: asString(data.summary),
    key_points: asStringList(data.key_points ?? data.keyPoints),
    impact_analysis: asString(data.impact_analysis ?? data.impactAnalysis),
    technologies: asStringList(data.technologies),
    related_reading,
    score: asNullableNumber(data.score ?? data.ai_score ?? data.aiScore),
    error: asString(data.error) || null,
    updated_at: asNullableNumber(data.updated_at ?? data.updatedAt),
  };
}

function normalizeSeries(value: unknown): AnalyticsItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      return {
        name: asString(record.name ?? record.label ?? record.keyword ?? record.domain),
        value: asNullableNumber(record.value ?? record.count ?? record.score) ?? 0,
      };
    })
    .filter((item) => item.name && item.value >= 0);
}

export function normalizeAnalytics(value: unknown): ArticleAnalytics | null {
  if (!value) return null;
  const input = asRecord(value);
  const trendRaw = input.trend ?? input.trend_points ?? input.trendPoints;
  const trend = Array.isArray(trendRaw)
    ? trendRaw
        .map((item) => {
          const record = asRecord(item);
          return {
            timestamp:
              asNullableNumber(record.timestamp ?? record.recorded_at ?? record.recordedAt) ?? 0,
            value: asNullableNumber(record.value ?? record.score ?? record.hot_score) ?? 0,
          };
        })
        .filter((item) => item.timestamp > 0 && item.value >= 0)
        .sort((left, right) => left.timestamp - right.timestamp)
    : [];

  return {
    views: asNullableNumber(input.views ?? input.view_count ?? input.viewCount),
    ai_score: asNullableNumber(input.ai_score ?? input.aiScore),
    trend,
    keywords: normalizeSeries(input.keywords),
    domains: normalizeSeries(input.domains ?? input.technical_domains ?? input.technicalDomains),
    updated_at: asNullableNumber(input.updated_at ?? input.updatedAt),
  };
}

export function serializeInsight(insight: ArticleInsight): string {
  return JSON.stringify({
    summary: insight.summary,
    key_points: insight.key_points,
    impact_analysis: insight.impact_analysis,
    technologies: insight.technologies,
    related_reading: insight.related_reading,
    score: insight.score,
  });
}
