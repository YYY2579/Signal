use async_trait::async_trait;
use serde::Deserialize;

use crate::models::{Article, RawArticle};

use super::{FetchError, FetchResult, SourceFetcher};

pub struct V2ex;

const BASE: &str = "https://www.v2ex.com/api";

#[derive(Deserialize)]
struct Topic {
    id: u64,
    title: String,
    content: Option<String>,
    content_rendered: Option<String>,
    replies: i64,
    last_modified: i64,
    member: Option<Member>,
}

#[derive(Deserialize)]
struct Member {
    username: String,
}

#[async_trait]
impl SourceFetcher for V2ex {
    fn id(&self) -> &'static str {
        "v2ex"
    }
    fn name(&self) -> &'static str {
        "V2EX"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let resp = client
            .get(format!("{}/topics/hot.json", BASE))
            .send()
            .await?;
        // 检查 rate limit，余量不足则跳过本轮
        if let Some(remaining) = resp.headers().get("X-Rate-Limit-Remaining") {
            if let Ok(n) = remaining.to_str().unwrap_or("999").parse::<i64>() {
                if n < 5 {
                    return Err(FetchError::RateLimited);
                }
            }
        }
        let topics: Vec<Topic> = resp.json().await?;

        let articles = topics
            .into_iter()
            .map(|t| RawArticle {
                native_id: t.id.to_string(),
                title: t.title,
                url: format!("https://www.v2ex.com/t/{}", t.id),
                summary: t
                    .content
                    .as_deref()
                    .map(strip_html)
                    .unwrap_or_default()
                    .chars()
                    .take(200)
                    .collect(),
                author: t.member.map(|m| m.username),
                hot_score: t.replies,
                hot_label: format!("{} replies", t.replies),
                comments_count: Some(t.replies),
                published_at: t.last_modified,
                thumbnail: None,
            })
            .collect();
        Ok(articles)
    }

    async fn fetch_content(
        &self,
        client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        let topics: Vec<Topic> = client
            .get(format!("{}/topics/show.json?id={}", BASE, article.native_id))
            .send()
            .await?
            .json()
            .await?;
        Ok(topics.into_iter().next().and_then(|t| t.content_rendered))
    }
}

fn strip_html(html: &str) -> String {
    use regex::Regex;
    use std::sync::OnceLock;
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"<[^>]+>").unwrap());
    re.replace_all(html, "").to_string()
}
