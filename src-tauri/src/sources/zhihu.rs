use async_trait::async_trait;
use regex::Regex;
use serde::Deserialize;
use std::sync::OnceLock;

use crate::models::{Article, RawArticle};

use super::{FetchResult, SourceFetcher};

pub struct Zhihu;

const HOT_URL: &str = "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total";

#[derive(Deserialize)]
struct HotResp {
    data: Option<Vec<HotItem>>,
}

#[derive(Deserialize)]
struct HotItem {
    target: Target,
    /// 热度文本，如 "123 万热度"
    detail_text: String,
}

#[derive(Deserialize)]
struct Target {
    title: String,
    excerpt: String,
    #[serde(default)]
    url: Option<String>,
    id: u64,
    answer_count: Option<i64>,
}

#[async_trait]
impl SourceFetcher for Zhihu {
    fn id(&self) -> &'static str {
        "zhihu"
    }
    fn name(&self) -> &'static str {
        "知乎"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let resp = client
            .get(format!("{}?limit=50", HOT_URL))
            // 伪装知乎 iOS App 请求头
            .header(
                "User-Agent",
                "osee2unifiedRelease/22916 osee2unifiedReleaseVersion/10.49.0 Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            )
            .header("x-app-versioncode", "22916")
            .header("x-app-bundleid", "com.zhihu.ios")
            .header("x-app-build", "release")
            // 注意：原 API 拼写错误 "ytpe"，必须保留
            .header("x-package-ytpe", "appstore")
            .header("x-app-za", "OS=iOS&Release=18.5&Model=iPhone17,2")
            .send()
            .await?;

        let hot: HotResp = resp.json().await?;
        let mut articles = Vec::new();
        if let Some(items) = hot.data {
            for item in items {
                let hot_score = parse_hot_score(&item.detail_text);
                let url = item
                    .target
                    .url
                    .unwrap_or_else(|| format!("https://www.zhihu.com/question/{}", item.target.id));
                articles.push(RawArticle {
                    native_id: item.target.id.to_string(),
                    title: item.target.title,
                    url,
                    summary: item.target.excerpt,
                    author: None,
                    hot_score,
                    hot_label: item.detail_text,
                    comments_count: item.target.answer_count,
                    published_at: 0,
                    thumbnail: None,
                });
            }
        }
        Ok(articles)
    }

    async fn fetch_content(
        &self,
        _client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        // MVP：excerpt 作为离线正文；详细答案需登录态调答案 API（后续实现）
        if article.summary.is_empty() {
            Ok(None)
        } else {
            Ok(Some(article.summary.clone()))
        }
    }
}

/// 从 "123 万热度" 提取数字 × 10000
fn parse_hot_score(detail_text: &str) -> i64 {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(\d+(?:\.\d+)?)").unwrap());
    if let Some(m) = re.captures(detail_text) {
        if let Ok(n) = m[1].parse::<f64>() {
            return (n * 10000.0) as i64;
        }
    }
    0
}
