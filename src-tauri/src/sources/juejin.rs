use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use serde::Deserialize;
use uuid::Uuid;

use crate::models::{Article, RawArticle};

use super::{FetchResult, SourceFetcher};

pub struct Juejin;

const LIST_URL: &str = "https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed";
const DETAIL_URL: &str = "https://api.juejin.cn/content_api/v1/article/detail";

#[derive(Deserialize)]
struct FeedResp {
    err_no: Option<i64>,
    data: Option<Vec<FeedItem>>,
}

#[derive(Deserialize)]
struct FeedItem {
    article_info: Option<ArticleInfo>,
    author_user_info: Option<AuthorInfo>,
    content_counter: Option<ContentCounter>,
}

#[derive(Deserialize)]
struct ArticleInfo {
    article_id: String,
    title: String,
    brief_content: String,
    /// 发布时间（毫秒）
    rtime: Option<i64>,
}

#[derive(Deserialize)]
struct AuthorInfo {
    user_name: String,
}

#[derive(Deserialize)]
struct ContentCounter {
    digg_count: i64,
    comment_count: i64,
    view_count: i64,
}

#[derive(Deserialize)]
struct DetailResp {
    data: Option<DetailData>,
}

#[derive(Deserialize)]
struct DetailData {
    article_content: String,
}

fn make_cursor(uuid: &str, offset: u32) -> String {
    let json = format!(r#"{{"v":"{}","i":{}}}"#, uuid, offset);
    general_purpose::STANDARD.encode(json.as_bytes())
}

#[async_trait]
impl SourceFetcher for Juejin {
    fn id(&self) -> &'static str {
        "juejin"
    }
    fn name(&self) -> &'static str {
        "掘金"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let uuid = Uuid::new_v4().to_string();
        let mut articles = Vec::new();

        // 抓 3 页凑够 40-60 条
        for offset in [0u32, 20, 40] {
            let cursor = make_cursor(&uuid, offset);
            let body = serde_json::json!({
                "id_type": 2,
                "client_type": 2608,
                "sort_type": 300,
                "cursor": cursor,
                "limit": 20
            });
            let url = format!("{}?aid=2608&uuid={}&spider=0", LIST_URL, uuid);
            let resp: FeedResp = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?
                .json()
                .await?;

            if resp.err_no.unwrap_or(0) != 0 {
                break;
            }
            if let Some(items) = resp.data {
                if items.is_empty() {
                    break;
                }
                for item in items {
                    if let Some(ai) = item.article_info {
                        let author = item.author_user_info.map(|a| a.user_name);
                        let c = item.content_counter.unwrap_or(ContentCounter {
                            digg_count: 0,
                            comment_count: 0,
                            view_count: 0,
                        });
                        let hot_score = c.digg_count * 2 + c.comment_count * 3 + c.view_count / 100;
                        let published_at = ai.rtime.unwrap_or(0) / 1000;
                        articles.push(RawArticle {
                            native_id: ai.article_id.clone(),
                            title: ai.title,
                            url: format!("https://juejin.cn/post/{}", ai.article_id),
                            summary: ai.brief_content,
                            author,
                            hot_score,
                            hot_label: format!("{}赞 {}评", c.digg_count, c.comment_count),
                            comments_count: Some(c.comment_count),
                            published_at,
                            thumbnail: None,
                        });
                    }
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
        let body = serde_json::json!({ "article_id": article.native_id });
        let resp: DetailResp = client
            .post(DETAIL_URL)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.data.map(|d| d.article_content))
    }
}
