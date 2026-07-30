use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;

use crate::models::RawArticle;

use super::{FetchError, FetchResult, SourceFetcher};

pub struct GitHubTrending;

const SEARCH_URL: &str = "https://api.github.com/search/repositories";

#[derive(Deserialize)]
struct SearchResponse {
    #[serde(default)]
    items: Vec<Repository>,
}

#[derive(Deserialize)]
struct Repository {
    id: u64,
    full_name: String,
    html_url: String,
    description: Option<String>,
    owner: Owner,
    #[serde(default)]
    stargazers_count: i64,
    created_at: String,
}

#[derive(Deserialize)]
struct Owner {
    login: String,
    avatar_url: String,
}

#[async_trait]
impl SourceFetcher for GitHubTrending {
    fn id(&self) -> &'static str {
        "github"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let since = (Utc::now() - Duration::days(7))
            .format("%Y-%m-%d")
            .to_string();
        let response = client
            .get(SEARCH_URL)
            .query(&[
                ("q", format!("created:>{since}")),
                ("sort", "stars".to_string()),
                ("order", "desc".to_string()),
                ("per_page", "25".to_string()),
            ])
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "Signal/0.1 GitHub-Search-Reader")
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
            || (response.status() == reqwest::StatusCode::FORBIDDEN
                && response
                    .headers()
                    .get("x-ratelimit-remaining")
                    .and_then(|value| value.to_str().ok())
                    == Some("0"))
        {
            return Err(FetchError::RateLimited);
        }
        let search: SearchResponse = response.error_for_status()?.json().await?;
        Ok(map_repositories(search.items))
    }
}

fn map_repositories(repositories: Vec<Repository>) -> Vec<RawArticle> {
    repositories
        .into_iter()
        .filter_map(|repository| {
            if repository.full_name.trim().is_empty()
                || !repository.html_url.starts_with("https://github.com/")
            {
                return None;
            }
            let published_at = DateTime::parse_from_rfc3339(&repository.created_at)
                .map(|timestamp| timestamp.timestamp())
                .unwrap_or(0);

            Some(RawArticle {
                native_id: repository.id.to_string(),
                title: repository.full_name,
                url: repository.html_url,
                summary: repository.description.unwrap_or_default(),
                author: (!repository.owner.login.trim().is_empty())
                    .then_some(repository.owner.login),
                hot_score: repository.stargazers_count,
                hot_label: format!("{} stars", repository.stargazers_count),
                comments_count: None,
                published_at,
                thumbnail: repository
                    .owner
                    .avatar_url
                    .starts_with("https://")
                    .then_some(repository.owner.avatar_url),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{map_repositories, SearchResponse};

    #[test]
    fn parses_real_github_search_item() {
        let search: SearchResponse = serde_json::from_str(
            r#"{
              "items": [{
                "id": 1313576395,
                "full_name": "MoonshotAI/Kimi-K3",
                "owner": {
                  "login": "MoonshotAI",
                  "avatar_url": "https://avatars.githubusercontent.com/u/129152888?v=4"
                },
                "html_url": "https://github.com/MoonshotAI/Kimi-K3",
                "description": "Open Frontier Intelligence",
                "created_at": "2026-07-27T08:01:37Z",
                "stargazers_count": 7270
              }]
            }"#,
        )
        .expect("real GitHub response fragment must deserialize");

        let articles = map_repositories(search.items);
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].native_id, "1313576395");
        assert_eq!(articles[0].title, "MoonshotAI/Kimi-K3");
        assert_eq!(articles[0].hot_score, 7_270);
        assert_eq!(articles[0].author.as_deref(), Some("MoonshotAI"));
    }
}
