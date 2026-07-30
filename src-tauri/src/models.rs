use serde::{Deserialize, Serialize};

/// 统一文章结构（跨数据源）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Article {
    /// 全局唯一 ID: "{source}:{native_id}"
    pub id: String,
    /// 数据源: hackernews / v2ex / juejin / zhihu
    pub source: String,
    /// 源站原生 ID
    pub native_id: String,
    pub title: String,
    pub url: String,
    pub summary: String,
    /// 正文 HTML/纯文本（离线阅读，None=未抓取）
    pub content: Option<String>,
    pub author: Option<String>,
    /// 归一化热度分（跨源排序）
    pub hot_score: i64,
    /// 原始热度文本（"1.2k points" / "123 万热度"）
    pub hot_label: String,
    pub comments_count: Option<i64>,
    /// Unix 秒
    pub published_at: i64,
    pub fetched_at: i64,
    pub thumbnail: Option<String>,
    pub is_read: bool,
    /// 正文是否已缓存
    pub has_content: bool,
    pub is_bookmarked: bool,
    pub is_read_later: bool,
    pub in_knowledge: bool,
    pub ai_status: Option<String>,
    pub ai_summary: Option<String>,
    pub ai_score: Option<f64>,
}

/// 抓取原始结构（入库前映射为 Article）
#[derive(Debug, Clone)]
pub struct RawArticle {
    pub native_id: String,
    pub title: String,
    pub url: String,
    pub summary: String,
    pub author: Option<String>,
    pub hot_score: i64,
    pub hot_label: String,
    pub comments_count: Option<i64>,
    pub published_at: i64,
    pub thumbnail: Option<String>,
}

impl RawArticle {
    /// 映射为统一 Article（source + fetched_at 由调用方提供）
    pub fn into_article(self, source: &str, fetched_at: i64) -> Article {
        let id = format!("{}:{}", source, self.native_id);
        Article {
            id,
            source: source.to_string(),
            native_id: self.native_id,
            title: self.title,
            url: self.url,
            summary: self.summary,
            content: None,
            author: self.author,
            hot_score: self.hot_score,
            hot_label: self.hot_label,
            comments_count: self.comments_count,
            published_at: self.published_at,
            fetched_at,
            thumbnail: self.thumbnail,
            is_read: false,
            has_content: false,
            is_bookmarked: false,
            is_read_later: false,
            in_knowledge: false,
            ai_status: None,
            ai_summary: None,
            ai_score: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiPreferences {
    #[serde(default = "default_ai_provider")]
    pub provider: String,
    #[serde(default = "default_ai_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_require_review")]
    pub require_review: bool,
}

impl Default for AiPreferences {
    fn default() -> Self {
        Self {
            provider: default_ai_provider(),
            base_url: default_ai_base_url(),
            model: String::new(),
            require_review: true,
        }
    }
}

fn default_ai_provider() -> String {
    "openai-compatible".into()
}

fn default_ai_base_url() -> String {
    "https://api.openai.com/v1".into()
}

fn default_require_review() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub configured: bool,
    pub require_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiValidation {
    pub valid: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSearchResponse {
    pub answer: String,
    pub articles: Vec<Article>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedReading {
    pub title: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArticleInsight {
    pub status: String,
    pub summary: String,
    pub key_points: Vec<String>,
    pub impact_analysis: String,
    pub technologies: Vec<String>,
    pub related_reading: Vec<RelatedReading>,
    pub score: Option<f64>,
    pub error: Option<String>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendPoint {
    pub timestamp: i64,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelValue {
    pub label: String,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArticleAnalytics {
    pub view_count: Option<i64>,
    pub ai_score: Option<f64>,
    pub trend: Vec<TrendPoint>,
    pub keywords: Vec<LabelValue>,
    pub domains: Vec<LabelValue>,
}

/// 数据源配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    #[serde(default = "default_subscribed")]
    pub subscribed: bool,
    pub interval_minutes: u64,
}

fn default_subscribed() -> bool {
    true
}

/// 登录态配置（每源可选 cookie）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LoginConfig {
    #[serde(default)]
    pub juejin: Option<String>,
    #[serde(default)]
    pub zhihu: Option<String>,
}

/// 关键词过滤配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FilterConfig {
    #[serde(default)]
    pub blacklist: Vec<String>,
    #[serde(default)]
    pub whitelist: Vec<String>,
}

/// 应用总配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_source_configs")]
    pub sources: Vec<SourceConfig>,
    #[serde(default)]
    pub filters: FilterConfig,
    #[serde(default)]
    pub login: LoginConfig,
    #[serde(default)]
    pub prefetch_content: bool,
    #[serde(default)]
    pub ai: AiPreferences,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            sources: default_source_configs(),
            filters: FilterConfig::default(),
            login: LoginConfig::default(),
            prefetch_content: false,
            ai: AiPreferences::default(),
        }
    }
}

pub fn default_source_configs() -> Vec<SourceConfig> {
    vec![
        SourceConfig {
            id: "hackernews".into(),
            name: "Hacker News".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 30,
        },
        SourceConfig {
            id: "github".into(),
            name: "GitHub Trending".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 60,
        },
        SourceConfig {
            id: "v2ex".into(),
            name: "V2EX".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 30,
        },
        SourceConfig {
            id: "juejin".into(),
            name: "掘金".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 20,
        },
        SourceConfig {
            id: "zhihu".into(),
            name: "知乎热榜".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 20,
        },
        SourceConfig {
            id: "csdn".into(),
            name: "CSDN 热榜".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 30,
        },
        SourceConfig {
            id: "leetcode".into(),
            name: "力扣讨论".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 30,
        },
        SourceConfig {
            id: "reddit".into(),
            name: "Reddit · r/programming".into(),
            enabled: false,
            subscribed: false,
            interval_minutes: 60,
        },
        SourceConfig {
            id: "rustblog".into(),
            name: "Rust 官方博客".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 120,
        },
    ]
}

/// 查询过滤参数
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ArticleFilter {
    #[serde(default)]
    pub blacklist: Vec<String>,
    #[serde(default)]
    pub whitelist: Vec<String>,
}

/// 各源未读数
pub type UnreadCounts = std::collections::HashMap<String, usize>;
