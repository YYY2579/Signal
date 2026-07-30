use async_trait::async_trait;
use chrono::DateTime;
use scraper::{ElementRef, Html, Selector};

use crate::models::{Article, RawArticle};

use super::{FetchResult, SourceFetcher};

pub struct Feed {
    source_id: &'static str,
    url: String,
}

impl Feed {
    pub fn new(source_id: &'static str, url: impl Into<String>) -> Self {
        Self {
            source_id,
            url: url.into(),
        }
    }
}

#[async_trait]
impl SourceFetcher for Feed {
    fn id(&self) -> &'static str {
        self.source_id
    }

    async fn fetch_hot(&self, client: &reqwest::Client) -> FetchResult<Vec<RawArticle>> {
        let xml = client
            .get(&self.url)
            .header(
                "Accept",
                "application/atom+xml, application/rss+xml, application/xml, text/xml",
            )
            .header("User-Agent", "Signal/0.1 Feed Reader")
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        Ok(parse_feed(&xml).into_iter().take(100).collect())
    }

    async fn fetch_content(
        &self,
        _client: &reqwest::Client,
        article: &Article,
    ) -> FetchResult<Option<String>> {
        Ok((!article.summary.trim().is_empty()).then(|| article.summary.clone()))
    }
}

fn parse_feed(xml: &str) -> Vec<RawArticle> {
    let document = Html::parse_document(xml);
    let entry_selector = selector("entry");
    if document.select(&entry_selector).next().is_some() {
        parse_atom(&document, &entry_selector)
    } else {
        parse_rss(xml)
    }
}

fn parse_atom(document: &Html, entry_selector: &Selector) -> Vec<RawArticle> {
    let title_selector = selector("title");
    let id_selector = selector("id");
    let link_selector = selector("link[href]");
    let summary_selector = selector("summary");
    let content_selector = selector("content");
    let published_selector = selector("published");
    let updated_selector = selector("updated");
    let author_selector = selector("author name");

    document
        .select(entry_selector)
        .filter_map(|entry| {
            let title = selected_text(entry, &title_selector)?;
            let link = entry.select(&link_selector).find_map(|element| {
                let rel = element.value().attr("rel").unwrap_or("alternate");
                (rel == "alternate" || rel.is_empty())
                    .then(|| element.value().attr("href"))
                    .flatten()
                    .map(str::to_string)
            })?;
            if title.is_empty() || !is_http_url(&link) {
                return None;
            }
            let native_id = selected_text(entry, &id_selector).unwrap_or_else(|| link.clone());
            let raw_summary = selected_text(entry, &summary_selector)
                .or_else(|| selected_text(entry, &content_selector))
                .unwrap_or_default();
            let published_at = selected_text(entry, &published_selector)
                .or_else(|| selected_text(entry, &updated_selector))
                .map(|value| parse_timestamp(&value))
                .unwrap_or(0);

            Some(RawArticle {
                native_id,
                title,
                url: link,
                summary: truncate(&plain_text(&raw_summary), 500),
                author: selected_text(entry, &author_selector),
                hot_score: 0,
                hot_label: "Feed".to_string(),
                comments_count: None,
                published_at,
                thumbnail: None,
            })
        })
        .collect()
}

fn parse_rss(xml: &str) -> Vec<RawArticle> {
    element_blocks(xml, "item")
        .into_iter()
        .filter_map(|item| {
            let title = plain_text(&element_value(item, "title")?);
            let link = plain_text(&element_value(item, "link")?);
            if title.is_empty() || !is_http_url(&link) {
                return None;
            }
            let native_id = element_value(item, "guid")
                .map(|value| plain_text(&value))
                .unwrap_or_else(|| link.clone());
            let raw_summary = element_value(item, "content:encoded")
                .or_else(|| element_value(item, "description"))
                .unwrap_or_default();
            let published_at = element_value(item, "pubDate")
                .or_else(|| element_value(item, "dc:date"))
                .map(|value| parse_timestamp(&value))
                .unwrap_or(0);
            let comments_count =
                element_value(item, "slash:comments").and_then(|value| value.parse::<i64>().ok());

            Some(RawArticle {
                native_id,
                title,
                url: link,
                summary: truncate(&plain_text(&raw_summary), 500),
                author: element_value(item, "dc:creator")
                    .or_else(|| element_value(item, "author"))
                    .map(|value| plain_text(&value)),
                hot_score: 0,
                hot_label: "Feed".to_string(),
                comments_count,
                published_at,
                thumbnail: None,
            })
        })
        .collect()
}

fn selector(value: &str) -> Selector {
    Selector::parse(value).expect("static feed selector must be valid")
}

fn selected_text(element: ElementRef<'_>, selector: &Selector) -> Option<String> {
    element
        .select(selector)
        .next()
        .map(|value| normalize_space(&value.text().collect::<Vec<_>>().join(" ")))
        .filter(|value| !value.is_empty())
}

fn element_blocks<'a>(xml: &'a str, tag: &str) -> Vec<&'a str> {
    let lowercase = xml.to_ascii_lowercase();
    let open_marker = format!("<{tag}");
    let close_marker = format!("</{tag}>");
    let mut blocks = Vec::new();
    let mut offset = 0;

    while let Some(start) = find_open_tag(&lowercase, offset, &open_marker) {
        let Some(open_end) = lowercase[start..].find('>').map(|index| start + index + 1) else {
            break;
        };
        let Some(relative_end) = lowercase[open_end..].find(&close_marker) else {
            break;
        };
        let end = open_end + relative_end;
        blocks.push(&xml[open_end..end]);
        offset = end + close_marker.len();
    }
    blocks
}

fn find_open_tag(value: &str, mut offset: usize, marker: &str) -> Option<usize> {
    while let Some(relative_start) = value[offset..].find(marker) {
        let start = offset + relative_start;
        let boundary = value.as_bytes().get(start + marker.len()).copied();
        if boundary.is_some_and(|byte| byte == b'>' || byte == b'/' || byte.is_ascii_whitespace()) {
            return Some(start);
        }
        offset = start + marker.len();
    }
    None
}

fn element_value(xml: &str, tag: &str) -> Option<String> {
    element_blocks(xml, tag)
        .into_iter()
        .next()
        .map(strip_cdata)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn strip_cdata(value: &str) -> &str {
    let value = value.trim();
    value
        .strip_prefix("<![CDATA[")
        .and_then(|inner| inner.strip_suffix("]]>"))
        .unwrap_or(value)
}

fn plain_text(value: &str) -> String {
    let first = fragment_text(value);
    if first.contains('<') && first.contains('>') {
        fragment_text(&first)
    } else {
        first
    }
}

fn fragment_text(value: &str) -> String {
    let document = Html::parse_fragment(value);
    normalize_space(&document.root_element().text().collect::<Vec<_>>().join(" "))
        .trim_end_matches("]]>")
        .trim()
        .to_string()
}

fn normalize_space(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate(value: &str, length: usize) -> String {
    value.chars().take(length).collect()
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

fn parse_timestamp(value: &str) -> i64 {
    DateTime::parse_from_rfc3339(value)
        .or_else(|_| DateTime::parse_from_rfc2822(value))
        .map(|timestamp| timestamp.timestamp())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::parse_feed;

    #[test]
    fn parses_real_rust_atom_entry() {
        let xml = r#"
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <title>Announcing Rust 1.97.1</title>
              <link rel="alternate" href="https://blog.rust-lang.org/2026/07/16/Rust-1.97.1/" />
              <published>2026-07-16T00:00:00+00:00</published>
              <id>https://blog.rust-lang.org/2026/07/16/Rust-1.97.1/</id>
              <content type="html">&lt;p&gt;The Rust team has published a new point release of Rust, 1.97.1.&lt;/p&gt;</content>
              <author><name>The Rust Release Team</name></author>
            </entry>
          </feed>
        "#;

        let articles = parse_feed(xml);
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Announcing Rust 1.97.1");
        assert_eq!(articles[0].author.as_deref(), Some("The Rust Release Team"));
        assert_eq!(articles[0].published_at, 1_784_160_000);
        assert!(articles[0].summary.starts_with("The Rust team"));
    }

    #[test]
    fn parses_real_hacker_news_rss_item() {
        let xml = r#"
          <rss version="2.0"><channel><item>
            <title><![CDATA[Why the future is local app]]></title>
            <description><![CDATA[<p>Article URL: <a href="https://getapps.cafe/blog/why-the-future-is-local-app">https://getapps.cafe/blog/why-the-future-is-local-app</a></p><p>Points: 32</p>]]></description>
            <pubDate>Thu, 30 Jul 2026 03:44:38 +0000</pubDate>
            <link>https://getapps.cafe/blog/why-the-future-is-local-app</link>
            <dc:creator>knlam</dc:creator>
            <guid isPermaLink="false">https://news.ycombinator.com/item?id=49105924</guid>
          </item></channel></rss>
        "#;

        let articles = parse_feed(xml);
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Why the future is local app");
        assert_eq!(articles[0].author.as_deref(), Some("knlam"));
        assert_eq!(
            articles[0].native_id,
            "https://news.ycombinator.com/item?id=49105924"
        );
        assert!(articles[0].summary.contains("Points: 32"));
    }
}
