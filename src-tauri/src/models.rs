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
        let summary = extractive_summary(&self.title, &self.summary, 360);
        Article {
            id,
            source: source.to_string(),
            native_id: self.native_id,
            title: self.title,
            url: self.url,
            summary,
            content: None,
            author: self.author,
            hot_score: self.hot_score,
            hot_label: self.hot_label,
            comments_count: self.comments_count,
            // Some hot-list APIs omit publication time. Use the observed time so the UI
            // remains useful without inventing an old date; adapters should still prefer source time.
            published_at: if self.published_at > 0 {
                self.published_at
            } else {
                fetched_at
            },
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

fn extractive_summary(title: &str, input: &str, max_chars: usize) -> String {
    let normalized = input.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }
    let title_terms = title
        .to_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .filter(|term| term.chars().count() >= 2)
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    let mut sentences = Vec::new();
    let mut start = 0;
    for (index, character) in normalized.char_indices() {
        if matches!(character, '.' | '!' | '?' | '。' | '！' | '？' | ';' | '；') {
            let end = index + character.len_utf8();
            let sentence = normalized[start..end].trim();
            if !sentence.is_empty() {
                sentences.push(sentence);
            }
            start = end;
        }
    }
    let tail = normalized[start..].trim();
    if !tail.is_empty() {
        sentences.push(tail);
    }
    if sentences.len() <= 1 {
        return truncate_chars(&normalized, max_chars);
    }

    let lower_sentences = sentences
        .iter()
        .map(|sentence| sentence.to_lowercase())
        .collect::<Vec<_>>();
    let mut ranked = lower_sentences
        .iter()
        .enumerate()
        .map(|(index, sentence)| {
            let overlap = title_terms
                .iter()
                .filter(|term| sentence.contains(term.as_str()))
                .count() as i64;
            (
                index,
                overlap * 10 + (sentences.len() - index).min(5) as i64,
            )
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
    let mut selected = ranked
        .into_iter()
        .take(3)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    selected.sort_unstable();
    let summary = selected
        .into_iter()
        .map(|index| sentences[index])
        .collect::<Vec<_>>()
        .join(" ");
    truncate_chars(&summary, max_chars)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let result = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{}...", result.trim_end())
    } else {
        result
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
    pub local_candidate_count: usize,
    pub cited_article_count: usize,
    pub answer_scope: AiAnswerScope,
    pub freshness_notice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AiAnswerScope {
    #[serde(rename = "local+model")]
    LocalAndModel,
    #[serde(rename = "model-only")]
    ModelOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindMapNode {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindMapEdge {
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArticleMindMap {
    pub title: String,
    pub nodes: Vec<MindMapNode>,
    pub edges: Vec<MindMapEdge>,
    pub updated_at: i64,
}

impl ArticleMindMap {
    pub fn validate(&self) -> Result<(), String> {
        if self.title.trim().is_empty() || self.nodes.is_empty() || self.nodes.len() > 40 {
            return Err("思维导图必须包含 1-40 个节点和标题".into());
        }
        let mut ids = std::collections::HashSet::new();
        for node in &self.nodes {
            if node.id.trim().is_empty()
                || node.label.trim().is_empty()
                || node.detail.trim().is_empty()
                || node.kind.trim().is_empty()
                || !ids.insert(node.id.trim())
            {
                return Err("思维导图节点 ID 必须唯一且节点内容不能为空".into());
            }
        }
        for edge in &self.edges {
            if edge.source.trim().is_empty()
                || edge.target.trim().is_empty()
                || !ids.contains(edge.source.trim())
                || !ids.contains(edge.target.trim())
                || edge.source.trim() == edge.target.trim()
            {
                return Err("思维导图边必须引用不同的已有节点".into());
            }
        }
        Ok(())
    }
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
    #[serde(default)]
    pub feed_url: Option<String>,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendingTopic {
    pub title: String,
    pub keywords: Vec<String>,
    pub article_count: usize,
    pub article: Article,
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
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "github".into(),
            name: "GitHub Trending".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 60,
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "v2ex".into(),
            name: "V2EX".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 30,
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "juejin".into(),
            name: "掘金".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 20,
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "zhihu".into(),
            name: "知乎热榜".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 20,
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "csdn".into(),
            name: "CSDN 热榜".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 30,
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "leetcode".into(),
            name: "力扣讨论".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 30,
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "reddit".into(),
            name: "Reddit · r/programming".into(),
            enabled: false,
            subscribed: false,
            interval_minutes: 60,
            feed_url: None,
            platform: None,
            icon: None,
        },
        SourceConfig {
            id: "rustblog".into(),
            name: "Rust 官方博客".into(),
            enabled: true,
            subscribed: true,
            interval_minutes: 120,
            feed_url: Some("https://blog.rust-lang.org/feed.xml".into()),
            platform: Some("rss".into()),
            icon: Some("rss".into()),
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

#[cfg(test)]
mod tests {
    use super::{extractive_summary, AiAnswerScope, ArticleMindMap, MindMapEdge, MindMapNode};

    #[test]
    fn extractive_summary_selects_relevant_sentences_and_stays_bounded() {
        let filler = "General introduction without the main subject. ".repeat(8);
        let input = format!(
            "{filler}Rust improves memory safety for services. More unrelated context. Rust also reduces production crashes. Final appendix details."
        );
        let summary = extractive_summary("Rust service reliability", &input, 180);
        assert!(summary.contains("Rust improves memory safety"));
        assert!(summary.chars().count() <= 183);
        assert_ne!(summary, input);
    }

    #[test]
    fn extractive_summary_preserves_short_source_abstract() {
        assert_eq!(
            extractive_summary("Signal", "A concise source abstract.", 360),
            "A concise source abstract."
        );
    }

    #[test]
    fn mind_map_rejects_duplicate_nodes_and_dangling_edges() {
        let mut map = ArticleMindMap {
            title: "Map".into(),
            nodes: vec![MindMapNode {
                id: "root".into(),
                label: "Root".into(),
                detail: "d".into(),
                kind: "topic".into(),
            }],
            edges: vec![MindMapEdge {
                source: "root".into(),
                target: "missing".into(),
                label: "".into(),
            }],
            updated_at: 1,
        };
        assert!(map.validate().is_err());
        map.edges.clear();
        map.nodes.push(MindMapNode {
            id: "root".into(),
            label: "Duplicate".into(),
            detail: "d".into(),
            kind: "topic".into(),
        });
        assert!(map.validate().is_err());
        map.nodes.truncate(1);
        map.edges = vec![MindMapEdge {
            source: "root".into(),
            target: "root".into(),
            label: "self".into(),
        }];
        assert!(map.validate().is_err());
        assert_eq!(AiAnswerScope::LocalAndModel, AiAnswerScope::LocalAndModel);
    }
}
