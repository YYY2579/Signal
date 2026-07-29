use async_trait::async_trait;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::Semaphore;

use crate::models::{Article, RawArticle};

use super::{FetchResult, SourceFetcher};

pub struct HackerNews;

const BASE: &str = "https://hacker-news.firebaseio.com/v0";

#[derive(Deserialize)]
struct Item {
    id: u64,
    title: Option<String>,
    url: Option<String>,
    score: Option<i64>,
    descendants: Option<i64>,
    time: Option<i64>,
    /// Ask HN / Show HN 的正文（HTML）
    text: Option<String>,
}

#[async_trait]
impl SourceFetcher for HackerNews {
    fn id(&self) -> &'static str {
        "hackernews"
    }
    fn name(&self) -> &'static str {
        "Hacker News"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let ids: Vec<u64> = client
            .get(format!("{}/topstories.json", BASE))
            .send()
            .await?
            .json()
            .await?;
        let ids: Vec<u64> = ids.into_iter().take(50).collect();

        // 并发取详情，限制 8 并发，避免 fan-out 打爆 API
        let sem = Arc::new(Semaphore::new(8));
        let mut handles = Vec::with_capacity(ids.len());
        for id in ids {
            let client = client.clone();
            let sem = sem.clone();
            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.ok()?;
                let item: Item = client
                    .get(format!("{}/item/{}.json", BASE, id))
                    .send()
                    .await
                    .ok()?
                    .json()
                    .await
                    .ok()?;
                Some(item)
            }));
        }

        let mut articles = Vec::new();
        for handle in handles {
            if let Ok(Some(item)) = handle.await {
                if let Some(title) = item.title {
                    let url = item.url.unwrap_or_else(|| {
                        format!("https://news.ycombinator.com/item?id={}", item.id)
                    });
                    let score = item.score.unwrap_or(0);
                    articles.push(RawArticle {
                        native_id: item.id.to_string(),
                        title,
                        url,
                        // HN 外链无摘要；Ask/Show HN 用 text 去标签作摘要
                        summary: item
                            .text
                            .as_deref()
                            .map(strip_html)
                            .unwrap_or_default(),
                        author: None,
                        hot_score: score,
                        hot_label: format!("{} points", score),
                        comments_count: item.descendants,
                        published_at: item.time.unwrap_or(0),
                        thumbnail: None,
                    });
                }
            }
        }
        Ok(articles)
    }

    async fn fetch_content(
        &self,
        client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        // Ask HN / Show HN 有 text 字段（已是 HTML），外链文章无正文
        let item: Item = client
            .get(format!("{}/item/{}.json", BASE, article.native_id))
            .send()
            .await?
            .json()
            .await?;
        Ok(item.text)
    }
}

/// 简易去 HTML 标签
fn strip_html(html: &str) -> String {
    use regex::Regex;
    use std::sync::OnceLock;
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"<[^>]+>").unwrap());
    let stripped = re.replace_all(html, "").to_string();
    stripped.chars().take(200).collect()
}
