use async_trait::async_trait;
use chrono::DateTime;
use serde::Deserialize;

use crate::models::{Article, RawArticle};

use super::{FetchResult, SourceFetcher};

pub struct LeetCode;

const GRAPHQL_URL: &str = "https://leetcode.cn/graphql/";
const HOT_QUERY: &str = r#"
query qaQuestionList(
  $subjectSlug: String,
  $isFeatured: Boolean!,
  $query: String,
  $pageNum: Int!,
  $sortType: CircleSortTypeEnum!
) {
  qaQuestionList(
    subjectSlug: $subjectSlug,
    isFeatured: $isFeatured,
    query: $query,
    pageNum: $pageNum,
    sortType: $sortType
  ) {
    nodes {
      topicId
      slug
      title
      summary
      hitCount
      numAnswers
      createdAt
      reactionsV2 { count reactionType }
      contentAuthor { username }
      realAuthor { username }
    }
  }
}
"#;

#[derive(Deserialize)]
struct GraphqlResponse {
    data: Option<GraphqlData>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphqlData {
    qa_question_list: QuestionList,
}

#[derive(Deserialize)]
struct QuestionList {
    #[serde(default)]
    nodes: Vec<Question>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Question {
    topic_id: String,
    slug: String,
    title: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    hit_count: i64,
    #[serde(default)]
    num_answers: i64,
    created_at: String,
    #[serde(default)]
    reactions_v2: Vec<Reaction>,
    content_author: Option<Author>,
    real_author: Option<Author>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reaction {
    #[serde(default)]
    count: i64,
    #[serde(default)]
    reaction_type: String,
}

#[derive(Deserialize)]
struct Author {
    #[serde(default)]
    username: String,
}

#[async_trait]
impl SourceFetcher for LeetCode {
    fn id(&self) -> &'static str {
        "leetcode"
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let body = serde_json::json!({
            "query": HOT_QUERY,
            "variables": {
                "subjectSlug": null,
                "isFeatured": false,
                "query": null,
                "pageNum": 1,
                "sortType": "HOTTEST"
            },
            "operationName": "qaQuestionList"
        });
        let response: GraphqlResponse = client
            .post(GRAPHQL_URL)
            .header("Content-Type", "application/json")
            .header("Referer", "https://leetcode.cn/discuss/")
            .header("User-Agent", "Signal/0.1 LeetCode-Discussion-Reader")
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(response
            .data
            .map(|data| map_questions(data.qa_question_list.nodes))
            .unwrap_or_default())
    }

    async fn fetch_content(
        &self,
        _client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        Ok((!article.summary.trim().is_empty()).then(|| article.summary.clone()))
    }
}

fn map_questions(questions: Vec<Question>) -> Vec<RawArticle> {
    questions
        .into_iter()
        .filter_map(|question| {
            if question.topic_id.is_empty()
                || question.slug.trim().is_empty()
                || question.title.trim().is_empty()
            {
                return None;
            }
            let published_at = DateTime::parse_from_rfc3339(&question.created_at)
                .map(|timestamp| timestamp.timestamp())
                .unwrap_or(0);
            let upvotes = question
                .reactions_v2
                .iter()
                .filter(|reaction| reaction.reaction_type == "UPVOTE")
                .map(|reaction| reaction.count)
                .sum::<i64>();
            let author = question
                .real_author
                .and_then(non_empty_username)
                .or_else(|| question.content_author.and_then(non_empty_username));

            Some(RawArticle {
                native_id: question.topic_id.clone(),
                title: question.title,
                url: format!(
                    "https://leetcode.cn/discuss/post/{}/{}/",
                    question.topic_id, question.slug
                ),
                summary: question.summary,
                author,
                hot_score: question.hit_count,
                hot_label: format!(
                    "{} 阅读 · {} 回答 · {} 赞",
                    question.hit_count, question.num_answers, upvotes
                ),
                comments_count: Some(question.num_answers),
                published_at,
                thumbnail: None,
            })
        })
        .collect()
}

fn non_empty_username(author: Author) -> Option<String> {
    (!author.username.trim().is_empty()).then_some(author.username)
}

#[cfg(test)]
mod tests {
    use super::{map_questions, GraphqlResponse};

    #[test]
    fn parses_real_leetcode_hot_question() {
        let response: GraphqlResponse = serde_json::from_str(
            r#"{
              "data": {
                "qaQuestionList": {
                  "nodes": [{
                    "topicId": "3989979",
                    "uuid": "G0iIYB",
                    "slug": "nu-sheng-neng-xue-ruan-jian-kai-fa-ma-by-ochw",
                    "title": "求助丨女生能学软件开发吗",
                    "summary": "女生适合学软件开发吗",
                    "hitCount": 3023,
                    "numAnswers": 70,
                    "createdAt": "2026-06-30T13:04:53.860114+00:00",
                    "reactionsV2": [{"count": 2, "reactionType": "UPVOTE"}],
                    "contentAuthor": {"username": "fervent-spencebv1"},
                    "realAuthor": null
                  }]
                }
              }
            }"#,
        )
        .expect("real LeetCode response fragment must deserialize");

        let articles = map_questions(
            response
                .data
                .expect("fixture has data")
                .qa_question_list
                .nodes,
        );
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].native_id, "3989979");
        assert_eq!(articles[0].hot_score, 3_023);
        assert_eq!(articles[0].comments_count, Some(70));
        assert_eq!(articles[0].author.as_deref(), Some("fervent-spencebv1"));
        assert!(articles[0].hot_label.contains("2 赞"));
    }
}
