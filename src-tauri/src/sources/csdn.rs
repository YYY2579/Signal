use async_trait::async_trait;
use scraper::{Html, Selector};
use serde::Deserialize;

use crate::models::{Article, RawArticle};

use super::{FetchResult, SourceFetcher};

pub struct Csdn;

const HOT_URL: &str = "https://blog.csdn.net/phoenix/web/blog/hot-rank?page=0&pageSize=50&type=pc";

#[derive(Deserialize)]
struct HotResponse {
    code: i64,
    #[serde(default)]
    data: Vec<HotItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HotItem {
    #[serde(default)]
    product_id: String,
    #[serde(default)]
    article_title: String,
    #[serde(default)]
    article_detail_url: String,
    #[serde(default)]
    nick_name: String,
    #[serde(default)]
    hot_rank_score: String,
    #[serde(default)]
    pc_hot_rank_score: String,
    #[serde(default)]
    comment_count: String,
    #[serde(default)]
    pic_list: Vec<String>,
    #[serde(
        default,
        alias = "createTime",
        alias = "postTime",
        alias = "publishTime"
    )]
    created_at: String,
}

#[async_trait]
impl SourceFetcher for Csdn {
    fn id(&self) -> &'static str {
        "csdn"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let response: HotResponse = client
            .get(HOT_URL)
            .header("Accept", "application/json, text/plain, */*")
            .header("Referer", "https://blog.csdn.net/rank/list")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Signal/0.1",
            )
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        if response.code != 200 {
            return Ok(Vec::new());
        }
        Ok(map_hot_items(response.data))
    }

    async fn fetch_content(
        &self,
        client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        let html = client
            .get(&article.url)
            .header("Referer", "https://blog.csdn.net/")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Signal/0.1",
            )
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        Ok(parse_article_content(&html))
    }
}

fn map_hot_items(items: Vec<HotItem>) -> Vec<RawArticle> {
    items
        .into_iter()
        .filter_map(|item| {
            if item.product_id.is_empty()
                || item.article_title.trim().is_empty()
                || !item.article_detail_url.starts_with("https://")
            {
                return None;
            }
            let hot_score = parse_integer(&item.hot_rank_score);
            let comments = parse_integer(&item.comment_count);
            let hot_label = if item.pc_hot_rank_score.trim().is_empty() {
                format!("{hot_score} 热度")
            } else {
                format!("{} 热度", item.pc_hot_rank_score.trim())
            };

            Some(RawArticle {
                native_id: item.product_id,
                title: item.article_title,
                url: item.article_detail_url,
                summary: String::new(),
                author: (!item.nick_name.trim().is_empty()).then_some(item.nick_name),
                hot_score,
                hot_label,
                comments_count: Some(comments),
                published_at: parse_source_timestamp(&item.created_at),
                thumbnail: item
                    .pic_list
                    .into_iter()
                    .find(|url| url.starts_with("https://")),
            })
        })
        .collect()
}

fn parse_article_content(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let selector =
        Selector::parse("#content_views").expect("static CSDN article selector must be valid");
    document
        .select(&selector)
        .next()
        .map(|content| content.inner_html())
        .filter(|content| !content.trim().is_empty())
}

fn parse_integer(value: &str) -> i64 {
    value
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(0)
}

fn parse_source_timestamp(value: &str) -> i64 {
    let value = value.trim();
    if value.is_empty() {
        return 0;
    }
    if let Ok(number) = value.parse::<i64>() {
        return if number > 10_000_000_000 {
            number / 1000
        } else {
            number
        };
    }
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|time| time.timestamp())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{map_hot_items, parse_article_content, parse_source_timestamp, HotResponse};

    #[test]
    fn parses_seconds_milliseconds_and_rfc3339_timestamps() {
        assert_eq!(parse_source_timestamp("1785456000"), 1_785_456_000);
        assert_eq!(parse_source_timestamp("1785456000000"), 1_785_456_000);
        assert_eq!(
            parse_source_timestamp("2026-07-31T00:00:00Z"),
            1_785_456_000
        );
    }

    #[test]
    fn parses_real_csdn_hot_item() {
        let response: HotResponse = serde_json::from_str(
            r#"{
              "code": 200,
              "data": [{
                "hotRankScore": "23973",
                "pcHotRankScore": "2.4w",
                "nickName": "艾莉丝努力练剑",
                "articleTitle": "【MYSQL】MYSQL学习的一大重点：表的内外连接",
                "articleDetailUrl": "https://blog.csdn.net/2401_89899187/article/details/163200338",
                "commentCount": "41",
                "picList": ["https://i-blog.csdnimg.cn/direct/1f4e02d2335a4cb59d53d81702a0f465.png"],
                "productId": "163200338"
              }]
            }"#,
        )
        .expect("real CSDN response fragment must deserialize");

        let articles = map_hot_items(response.data);
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].native_id, "163200338");
        assert_eq!(articles[0].hot_score, 23_973);
        assert_eq!(articles[0].comments_count, Some(41));
    }

    #[test]
    fn extracts_real_csdn_article_body_fragment() {
        let html = r#"
          <article class="baidu_pl">
            <div id="article_content" class="article_content clearfix">
              <div id="content_views" class="markdown_views prism-atom-one-dark">
                <svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
                  <path stroke-linecap="round" d="M5,0 0,2.5 5,5z" id="raphael-marker-block"></path>
                </svg>
                <br />
                <div align="center">
                  <img src="https://i-blog.csdnimg.cn/direct/935bcc1d96474bb29afa2641979670c9.png" width="200" height="200" alt="头像" />
                </div>
                <h2><a id="0___23"></a>0 ~&gt; 表连接的基础本质</h2>
                <p>两张表的所有行进行全量排列组合，若表 A 有 m 行、表 B 有 n 行，则结果集为 m×n 行。</p>
              </div>
            </div>
          </article>
        "#;

        let content = parse_article_content(html).expect("real CSDN article body must be found");
        assert!(content.contains("935bcc1d96474bb29afa2641979670c9.png"));
        assert!(content.contains("表连接的基础本质"));
        assert!(content.contains("两张表的所有行进行全量排列组合"));
    }
}
