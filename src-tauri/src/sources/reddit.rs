use async_trait::async_trait;
use serde::Deserialize;

use crate::models::RawArticle;

use super::{FetchError, FetchResult, SourceFetcher};

pub struct Reddit {
    subreddit: String,
}

impl Reddit {
    pub fn new(subreddit: impl Into<String>) -> Self {
        let subreddit = subreddit.into();
        let subreddit = subreddit
            .trim()
            .trim_start_matches("r/")
            .chars()
            .filter(|character| character.is_ascii_alphanumeric() || *character == '_')
            .collect::<String>();
        Self {
            subreddit: if subreddit.is_empty() {
                "programming".to_string()
            } else {
                subreddit
            },
        }
    }
}

impl Default for Reddit {
    fn default() -> Self {
        Self::new("programming")
    }
}

#[derive(Deserialize)]
struct Listing {
    data: ListingData,
}

#[derive(Deserialize)]
struct ListingData {
    #[serde(default)]
    children: Vec<ListingChild>,
}

#[derive(Deserialize)]
struct ListingChild {
    data: Post,
}

#[derive(Deserialize)]
struct Post {
    id: String,
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    permalink: String,
    #[serde(default)]
    selftext: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    score: i64,
    #[serde(default)]
    num_comments: i64,
    #[serde(default)]
    created_utc: f64,
    thumbnail: Option<String>,
}

#[async_trait]
impl SourceFetcher for Reddit {
    fn id(&self) -> &'static str {
        "reddit"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let url = format!(
            "https://www.reddit.com/r/{}/hot.json?limit=50&raw_json=1",
            self.subreddit
        );
        let response = client
            .get(url)
            .header("Accept", "application/json")
            .header(
                "User-Agent",
                "macos:signal-information-os:0.1 (public feed reader)",
            )
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(FetchError::RateLimited);
        }
        let listing: Listing = response.error_for_status()?.json().await?;
        Ok(map_listing(listing))
    }
}

fn map_listing(listing: Listing) -> Vec<RawArticle> {
    listing
        .data
        .children
        .into_iter()
        .filter_map(|child| {
            let post = child.data;
            if post.id.is_empty() || post.title.trim().is_empty() {
                return None;
            }
            let url = if post.url.starts_with("http://") || post.url.starts_with("https://") {
                post.url
            } else if post.permalink.starts_with('/') {
                format!("https://www.reddit.com{}", post.permalink)
            } else {
                return None;
            };
            let summary = post.selftext.chars().take(500).collect();
            let author = (!post.author.trim().is_empty()).then_some(post.author);
            let thumbnail = post
                .thumbnail
                .filter(|value| value.starts_with("https://") || value.starts_with("http://"));

            Some(RawArticle {
                native_id: post.id,
                title: post.title,
                url,
                summary,
                author,
                hot_score: post.score,
                hot_label: format!("{} points", post.score),
                comments_count: Some(post.num_comments),
                published_at: post.created_utc.round() as i64,
                thumbnail,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{map_listing, Listing, Reddit};

    #[test]
    fn accepts_an_empty_public_listing() {
        let listing: Listing = serde_json::from_str(r#"{"data":{"children":[]}}"#)
            .expect("Reddit listing envelope must deserialize");
        assert!(map_listing(listing).is_empty());
    }

    #[test]
    fn normalizes_subreddit_name() {
        let reddit = Reddit::new("r/rust_lang!");
        assert_eq!(reddit.subreddit, "rust_lang");
    }
}
