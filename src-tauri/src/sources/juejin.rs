use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use serde::Deserialize;
use uuid::Uuid;

use crate::models::{Article, RawArticle};

use super::{FetchError, FetchResult, SourceFetcher};

pub struct Juejin;

const LIST_URL: &str = "https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed";
const DETAIL_URL: &str = "https://api.juejin.cn/content_api/v1/article/detail";

#[derive(Deserialize)]
struct FeedResp {
    #[serde(default)]
    err_no: i64,
    #[serde(default)]
    err_msg: String,
    #[serde(default)]
    data: Vec<FeedItem>,
}

#[derive(Deserialize)]
struct FeedItem {
    item_info: Option<FeedItemInfo>,
    // Compatibility with the previous unnested response shape.
    article_info: Option<ArticleInfo>,
    author_user_info: Option<AuthorInfo>,
    content_counter: Option<ContentCounter>,
}

#[derive(Deserialize)]
struct FeedItemInfo {
    article_info: Option<ArticleInfo>,
    author_user_info: Option<AuthorInfo>,
    content_counter: Option<ContentCounter>,
}

#[derive(Deserialize)]
struct ArticleInfo {
    article_id: String,
    title: String,
    brief_content: String,
    rtime: Option<IntegerValue>,
    ctime: Option<IntegerValue>,
    #[serde(default)]
    digg_count: i64,
    #[serde(default)]
    comment_count: i64,
    #[serde(default)]
    view_count: i64,
    #[serde(default)]
    cover_image: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum IntegerValue {
    Number(i64),
    Text(String),
}

#[derive(Deserialize)]
struct AuthorInfo {
    user_name: String,
}

#[derive(Default, Deserialize)]
struct ContentCounter {
    #[serde(default)]
    digg_count: i64,
    #[serde(default)]
    comment_count: i64,
    #[serde(default)]
    view_count: i64,
}

#[derive(Deserialize)]
struct DetailResp {
    #[serde(default)]
    err_no: i64,
    #[serde(default)]
    err_msg: String,
    data: Option<DetailData>,
}

#[derive(Deserialize)]
struct DetailData {
    #[serde(default)]
    article_content: String,
    article_info: Option<DetailArticleInfo>,
}

#[derive(Deserialize)]
struct DetailArticleInfo {
    #[serde(default)]
    mark_content: String,
    #[serde(default)]
    app_html_content: String,
    web_html_content: Option<String>,
}

fn make_cursor(uuid: &str, offset: u32) -> String {
    let json = format!(r#"{{"v":"{}","i":{}}}"#, uuid, offset);
    general_purpose::STANDARD.encode(json.as_bytes())
}

fn ensure_api_success(code: i64, message: String) -> FetchResult<()> {
    if code == 0 {
        Ok(())
    } else {
        Err(FetchError::Api { code, message })
    }
}

fn parse_integer(value: IntegerValue) -> Option<i64> {
    match value {
        IntegerValue::Number(value) => Some(value),
        IntegerValue::Text(value) => value.parse().ok(),
    }
}

fn unix_seconds(value: IntegerValue) -> Option<i64> {
    parse_integer(value).map(|timestamp| {
        if timestamp.abs() >= 100_000_000_000 {
            timestamp / 1000
        } else {
            timestamp
        }
    })
}

fn map_feed_items(items: Vec<FeedItem>) -> Vec<RawArticle> {
    items
        .into_iter()
        .filter_map(|item| {
            let (article_info, author, counter) = if let Some(info) = item.item_info {
                (
                    info.article_info,
                    info.author_user_info,
                    info.content_counter,
                )
            } else {
                (
                    item.article_info,
                    item.author_user_info,
                    item.content_counter,
                )
            };
            let article = article_info?;
            if article.article_id.is_empty() || article.title.trim().is_empty() {
                return None;
            }
            let counter = counter.unwrap_or(ContentCounter {
                digg_count: article.digg_count,
                comment_count: article.comment_count,
                view_count: article.view_count,
            });
            let published_at = article
                .rtime
                .or(article.ctime)
                .and_then(unix_seconds)
                .unwrap_or(0);
            let thumbnail = (!article.cover_image.trim().is_empty()
                && (article.cover_image.starts_with("https://")
                    || article.cover_image.starts_with("http://")))
            .then_some(article.cover_image);
            let hot_score =
                counter.digg_count * 2 + counter.comment_count * 3 + counter.view_count / 100;

            Some(RawArticle {
                native_id: article.article_id.clone(),
                title: article.title,
                url: format!("https://juejin.cn/post/{}", article.article_id),
                summary: article.brief_content,
                author: author
                    .map(|author| author.user_name)
                    .filter(|name| !name.trim().is_empty()),
                hot_score,
                hot_label: format!("{}赞 {}评", counter.digg_count, counter.comment_count),
                comments_count: Some(counter.comment_count),
                published_at,
                thumbnail,
            })
        })
        .collect()
}

fn detail_content(data: DetailData) -> Option<String> {
    let mut candidates = vec![data.article_content];
    if let Some(article) = data.article_info {
        candidates.extend([
            article.web_html_content.unwrap_or_default(),
            article.app_html_content,
            article.mark_content,
        ]);
    }
    candidates
        .into_iter()
        .find(|value| !value.trim().is_empty())
}

#[async_trait]
impl SourceFetcher for Juejin {
    fn id(&self) -> &'static str {
        "juejin"
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
                .header("Accept", "application/json, text/plain, */*")
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            ensure_api_success(resp.err_no, resp.err_msg)?;
            if resp.data.is_empty() {
                break;
            }
            articles.extend(map_feed_items(resp.data));
        }
        Ok(articles)
    }

    async fn fetch_content(
        &self,
        client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        let body = serde_json::json!({
            "article_id": article.native_id,
            "client_type": 2608
        });
        let resp: DetailResp = client
            .post(DETAIL_URL)
            .header("Accept", "application/json, text/plain, */*")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        ensure_api_success(resp.err_no, resp.err_msg)?;
        Ok(resp.data.and_then(detail_content))
    }
}

#[cfg(test)]
mod tests {
    use super::{detail_content, ensure_api_success, map_feed_items, DetailResp, FeedResp};

    #[test]
    fn parses_current_nested_feed_response() {
        let response: FeedResp = serde_json::from_str(
            r##"{
              "err_no": 0,
              "err_msg": "success",
              "data": [{
                "item_type": 2,
                "item_info": {
                  "article_id": "7668204673984675850",
                  "article_info": {
                    "article_id": "7668204673984675850",
                    "title": "从零开发一个 Coding Agent（四）",
                    "brief_content": "使用状态机校验大模型事件流",
                    "rtime": "1785418346",
                    "digg_count": 12,
                    "comment_count": 3,
                    "view_count": 940,
                    "cover_image": "https://p3-xtjj-sign.byteimg.com/cover.awebp"
                  },
                  "author_user_info": { "user_name": "东方小月" }
                }
              }]
            }"##,
        )
        .expect("current Juejin feed fragment must deserialize");

        ensure_api_success(response.err_no, response.err_msg).expect("response is successful");
        let articles = map_feed_items(response.data);
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].native_id, "7668204673984675850");
        assert_eq!(articles[0].author.as_deref(), Some("东方小月"));
        assert_eq!(articles[0].published_at, 1_785_418_346);
        assert_eq!(articles[0].hot_score, 42);
        assert_eq!(articles[0].comments_count, Some(3));
        assert!(articles[0].thumbnail.is_some());
    }

    #[test]
    fn extracts_current_nested_detail_content() {
        let response: DetailResp = serde_json::from_str(
            r###"{
              "err_no": 0,
              "err_msg": "success",
              "data": {
                "article_id": "7668204673984675850",
                "article_info": {
                  "mark_content": "## 事件流的状态\n\n正文",
                  "app_html_content": "",
                  "web_html_content": null
                }
              }
            }"###,
        )
        .expect("current Juejin detail fragment must deserialize");

        let content = response
            .data
            .and_then(detail_content)
            .expect("nested mark_content must be used");
        assert!(content.contains("事件流的状态"));
    }

    #[test]
    fn reports_juejin_api_errors() {
        let error =
            ensure_api_success(2, "参数错误".to_string()).expect_err("non-zero err_no must fail");
        assert_eq!(error.to_string(), "source api error 2: 参数错误");
    }
}
