use async_trait::async_trait;
use scraper::{Html, Selector};

use crate::models::{Article, RawArticle};

pub mod csdn;
pub mod feed;
pub mod github;
pub mod hackernews;
pub mod juejin;
pub mod leetcode;
pub mod reddit;
pub mod v2ex;
pub mod zhihu;

#[derive(Debug, thiserror::Error)]
pub enum FetchError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("source api error {code}: {message}")]
    Api { code: i64, message: String },
    #[error("rate limited, skip this round")]
    RateLimited,
}

pub type FetchResult<T> = Result<T, FetchError>;

/// 统一数据源抓取接口
#[async_trait]
pub trait SourceFetcher: Send + Sync {
    /// 数据源标识
    fn id(&self) -> &str;
    /// 抓取热门文章元数据（不含正文）
    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>>;
    /// 抓取单篇文章正文（用于离线缓存），默认返回 None
    async fn fetch_content(
        &self,
        client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        fetch_readable_content(client, &article.url).await
    }
}

pub(crate) async fn fetch_readable_content(
    client: &reqwest::Client,
    url: &str,
) -> FetchResult<Option<String>> {
    let html = client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Signal/0.1 Reader",
        )
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    Ok(extract_readable_content(&html))
}

fn extract_readable_content(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let selectors = [
        "[itemprop='articleBody']",
        "article",
        "main",
        ".post-content",
        ".entry-content",
        ".article-content",
        "#article-content",
    ];
    let mut candidates = Vec::new();
    for value in selectors {
        let Ok(selector) = Selector::parse(value) else {
            continue;
        };
        candidates.extend(document.select(&selector).filter_map(|element| {
            let text_length = element
                .text()
                .flat_map(str::chars)
                .filter(|character| !character.is_whitespace())
                .count();
            (text_length >= 120).then(|| (text_length, element.inner_html()))
        }));
    }
    candidates
        .into_iter()
        .max_by_key(|(text_length, _)| *text_length)
        .map(|(_, content)| content)
        .filter(|content| !content.trim().is_empty())
}

/// 注册所有数据源
pub fn all_sources() -> Vec<Box<dyn SourceFetcher>> {
    vec![
        Box::new(hackernews::HackerNews),
        Box::new(github::GitHubTrending),
        Box::new(v2ex::V2ex),
        Box::new(juejin::Juejin),
        Box::new(zhihu::Zhihu),
        Box::new(csdn::Csdn),
        Box::new(leetcode::LeetCode),
        Box::new(reddit::Reddit::default()),
        Box::new(feed::Feed::new(
            "rustblog",
            "https://blog.rust-lang.org/feed.xml",
        )),
    ]
}

#[cfg(test)]
mod tests {
    use super::extract_readable_content;

    #[test]
    fn extracts_largest_article_body_and_rejects_navigation_only_html() {
        let body = "Useful article sentence. ".repeat(12);
        let html = format!(
            "<html><body><nav>Home</nav><article><h1>Title</h1><p>{body}</p></article></body></html>"
        );
        let extracted = extract_readable_content(&html).expect("article body");
        assert!(extracted.contains("Useful article sentence"));
        assert!(extract_readable_content("<html><body><nav>Home</nav></body></html>").is_none());
    }
}
