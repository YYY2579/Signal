use async_trait::async_trait;

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
    fn id(&self) -> &'static str;
    /// 抓取热门文章元数据（不含正文）
    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>>;
    /// 抓取单篇文章正文（用于离线缓存），默认返回 None
    async fn fetch_content(
        &self,
        _client: &reqwest::Client,
        _article: &Article,
    ) -> FetchResult<Option<String>> {
        Ok(None)
    }
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
