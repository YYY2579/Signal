use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use sqlx::Row;
use std::collections::HashMap;
use std::path::PathBuf;

use crate::models::{
    Article, ArticleAnalytics, ArticleFilter, ArticleInsight, LabelValue, RawArticle,
    RelatedReading, TrendPoint, UnreadCounts,
};

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  native_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  author TEXT,
  hot_score INTEGER DEFAULT 0,
  hot_label TEXT,
  comments_count INTEGER,
  published_at INTEGER,
  fetched_at INTEGER,
  thumbnail TEXT,
  is_read INTEGER DEFAULT 0,
  has_content INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
CREATE INDEX IF NOT EXISTS idx_articles_fetched ON articles(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);

CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title, summary, content, content='articles', content_rowid=rowid
);
CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, summary, content)
  VALUES (new.rowid, new.title, new.summary, new.content);
END;
CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary, content)
  VALUES ('delete', old.rowid, old.title, old.summary, old.content);
END;
CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary, content)
  VALUES ('delete', old.rowid, old.title, old.summary, old.content);
  INSERT INTO articles_fts(rowid, title, summary, content)
  VALUES (new.rowid, new.title, new.summary, new.content);
END;

CREATE TABLE IF NOT EXISTS fetch_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT,
  new_count INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS article_user_state (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  bookmarked INTEGER NOT NULL DEFAULT 0,
  read_later INTEGER NOT NULL DEFAULT 0,
  in_knowledge INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_state_bookmarked ON article_user_state(bookmarked);
CREATE INDEX IF NOT EXISTS idx_user_state_read_later ON article_user_state(read_later);
CREATE INDEX IF NOT EXISTS idx_user_state_knowledge ON article_user_state(in_knowledge);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_artifacts (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  key_points TEXT NOT NULL DEFAULT '[]',
  impact_analysis TEXT NOT NULL DEFAULT '',
  technologies TEXT NOT NULL DEFAULT '[]',
  related_reading TEXT NOT NULL DEFAULT '[]',
  score REAL,
  error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hot_snapshots (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  captured_at INTEGER NOT NULL,
  hot_score INTEGER NOT NULL,
  comments_count INTEGER,
  PRIMARY KEY(article_id, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_hot_snapshots_article_time
  ON hot_snapshots(article_id, captured_at DESC);
"#;

pub async fn init_pool(db_path: PathBuf) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::query(SCHEMA).execute(&pool).await?;
    repair_legacy_article_urls(&pool).await?;
    repair_legacy_article_metadata(&pool).await?;
    Ok(pool)
}

async fn repair_legacy_article_urls(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE articles
         SET url = 'https://www.zhihu.com/question/' || native_id
         WHERE source = 'zhihu'
           AND url != ('https://www.zhihu.com/question/' || native_id)",
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

async fn repair_legacy_article_metadata(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE articles SET published_at = fetched_at
         WHERE COALESCE(published_at, 0) <= 0 AND fetched_at > 0",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE articles SET content = NULL, has_content = 0
         WHERE content IS NOT NULL AND TRIM(content) = TRIM(COALESCE(summary, ''))",
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// 批量插入文章（去重），返回新增条数
pub async fn insert_articles(
    pool: &SqlitePool,
    source: &str,
    fetched_at: i64,
    raws: Vec<RawArticle>,
) -> Result<usize, sqlx::Error> {
    let mut new_count = 0usize;
    for raw in raws {
        let a = raw.into_article(source, fetched_at);
        let result = sqlx::query(
            "INSERT OR IGNORE INTO articles
             (id, source, native_id, title, url, summary, content, author,
              hot_score, hot_label, comments_count, published_at, fetched_at,
              thumbnail, is_read, has_content)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)",
        )
        .bind(&a.id)
        .bind(&a.source)
        .bind(&a.native_id)
        .bind(&a.title)
        .bind(&a.url)
        .bind(&a.summary)
        .bind(a.content.as_deref())
        .bind(a.author.as_deref())
        .bind(a.hot_score)
        .bind(&a.hot_label)
        .bind(a.comments_count)
        .bind(a.published_at)
        .bind(a.fetched_at)
        .bind(a.thumbnail.as_deref())
        .execute(pool)
        .await?;
        if result.rows_affected() > 0 {
            new_count += 1;
        } else {
            // Existing rows keep user state and cached content, while source metadata is refreshed.
            sqlx::query(
                "UPDATE articles SET title=?, url=?, summary=?, author=?, hot_score=?,
                 hot_label=?, comments_count=?, published_at=?, fetched_at=?, thumbnail=? WHERE id=?",
            )
            .bind(&a.title)
            .bind(&a.url)
            .bind(&a.summary)
            .bind(a.author.as_deref())
            .bind(a.hot_score)
            .bind(&a.hot_label)
            .bind(a.comments_count)
            .bind(a.published_at)
            .bind(a.fetched_at)
            .bind(a.thumbnail.as_deref())
            .bind(&a.id)
            .execute(pool)
            .await?;
        }
        sqlx::query(
            "INSERT OR REPLACE INTO hot_snapshots
             (article_id, captured_at, hot_score, comments_count) VALUES (?,?,?,?)",
        )
        .bind(&a.id)
        .bind(fetched_at)
        .bind(a.hot_score)
        .bind(a.comments_count)
        .execute(pool)
        .await?;
    }
    Ok(new_count)
}

fn row_to_article(row: &sqlx::sqlite::SqliteRow) -> Article {
    Article {
        id: row.get("id"),
        source: row.get("source"),
        native_id: row.get("native_id"),
        title: row.get("title"),
        url: row.get("url"),
        summary: row.get::<Option<String>, _>("summary").unwrap_or_default(),
        content: row.get("content"),
        author: row.get("author"),
        hot_score: row.get("hot_score"),
        hot_label: row
            .get::<Option<String>, _>("hot_label")
            .unwrap_or_default(),
        comments_count: row.get("comments_count"),
        published_at: row.get("published_at"),
        fetched_at: row.get("fetched_at"),
        thumbnail: row.get("thumbnail"),
        is_read: row.get::<i64, _>("is_read") != 0,
        has_content: row.get::<i64, _>("has_content") != 0,
        is_bookmarked: row.get::<i64, _>("is_bookmarked") != 0,
        is_read_later: row.get::<i64, _>("is_read_later") != 0,
        in_knowledge: row.get::<i64, _>("in_knowledge") != 0,
        ai_status: row.get("ai_status"),
        ai_summary: row.get("ai_summary"),
        ai_score: row.get("ai_score"),
    }
}

fn matches_filter(article: &Article, filter: &ArticleFilter) -> bool {
    let text = format!("{} {}", article.title, article.summary).to_lowercase();
    let matches_whitelist = filter.whitelist.is_empty()
        || filter
            .whitelist
            .iter()
            .any(|keyword| text.contains(&keyword.to_lowercase()));
    let matches_blacklist = filter
        .blacklist
        .iter()
        .any(|keyword| text.contains(&keyword.to_lowercase()));

    matches_whitelist && !matches_blacklist
}

/// 查询文章列表（不带 content），支持按源/关键词过滤
pub async fn get_articles(
    pool: &SqlitePool,
    source: Option<&str>,
    limit: i64,
    offset: i64,
    filter: Option<&ArticleFilter>,
) -> Result<Vec<Article>, sqlx::Error> {
    let sql = if source.is_some() {
        "SELECT a.id, a.source, a.native_id, a.title, a.url, a.summary,
                NULL AS content, a.author, a.hot_score, a.hot_label, a.comments_count,
                a.published_at, a.fetched_at, a.thumbnail, a.is_read, a.has_content,
                COALESCE(us.bookmarked, 0) AS is_bookmarked,
                COALESCE(us.read_later, 0) AS is_read_later,
                COALESCE(us.in_knowledge, 0) AS in_knowledge,
                ai.status AS ai_status,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.summary END AS ai_summary,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.score END AS ai_score
         FROM articles a LEFT JOIN article_user_state us ON us.article_id = a.id
         LEFT JOIN ai_artifacts ai ON ai.article_id = a.id
         WHERE a.source = ? ORDER BY a.fetched_at DESC LIMIT ? OFFSET ?"
    } else {
        "SELECT a.id, a.source, a.native_id, a.title, a.url, a.summary,
                NULL AS content, a.author, a.hot_score, a.hot_label, a.comments_count,
                a.published_at, a.fetched_at, a.thumbnail, a.is_read, a.has_content,
                COALESCE(us.bookmarked, 0) AS is_bookmarked,
                COALESCE(us.read_later, 0) AS is_read_later,
                COALESCE(us.in_knowledge, 0) AS in_knowledge,
                ai.status AS ai_status,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.summary END AS ai_summary,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.score END AS ai_score
         FROM articles a LEFT JOIN article_user_state us ON us.article_id = a.id
         LEFT JOIN ai_artifacts ai ON ai.article_id = a.id
         ORDER BY a.fetched_at DESC LIMIT ? OFFSET ?"
    };

    let rows = if let Some(src) = source {
        sqlx::query(sql)
            .bind(src)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?
    } else {
        sqlx::query(sql)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?
    };

    let mut articles: Vec<Article> = rows.iter().map(row_to_article).collect();

    // 关键词过滤（Rust 端，支持黑/白名单）
    if let Some(f) = filter {
        articles.retain(|article| matches_filter(article, f));
    }
    Ok(articles)
}

/// 取单篇文章正文
pub async fn get_content(
    pool: &SqlitePool,
    article_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query("SELECT content FROM articles WHERE id = ?")
        .bind(article_id)
        .fetch_optional(pool)
        .await?;
    Ok(row
        .and_then(|r| r.get::<Option<String>, _>("content"))
        .filter(|content| !content.trim().is_empty()))
}

/// 按 id 查单篇文章（含 content）
pub async fn get_article_by_id(
    pool: &SqlitePool,
    article_id: &str,
) -> Result<Option<Article>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT a.id, a.source, a.native_id, a.title, a.url, a.summary, a.content,
                a.author, a.hot_score, a.hot_label, a.comments_count, a.published_at,
                a.fetched_at, a.thumbnail, a.is_read, a.has_content,
                COALESCE(us.bookmarked, 0) AS is_bookmarked,
                COALESCE(us.read_later, 0) AS is_read_later,
                COALESCE(us.in_knowledge, 0) AS in_knowledge,
                ai.status AS ai_status,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.summary END AS ai_summary,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.score END AS ai_score
         FROM articles a LEFT JOIN article_user_state us ON us.article_id = a.id
         LEFT JOIN ai_artifacts ai ON ai.article_id = a.id
         WHERE a.id = ?",
    )
    .bind(article_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.as_ref().map(row_to_article))
}

/// 更新文章正文（标记 has_content）
pub async fn update_content(
    pool: &SqlitePool,
    article_id: &str,
    content: &str,
) -> Result<(), sqlx::Error> {
    let content = content.trim();
    sqlx::query(
        "UPDATE articles SET content = NULLIF(?, ''),
         has_content = CASE WHEN ? = '' THEN 0 ELSE 1 END WHERE id = ?",
    )
    .bind(content)
    .bind(content)
    .bind(article_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// FTS5 全文搜索
pub async fn search_articles(
    pool: &SqlitePool,
    query: &str,
    filter: Option<&ArticleFilter>,
) -> Result<Vec<Article>, sqlx::Error> {
    let query = build_fts_query(query);
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query(
        "SELECT a.id, a.source, a.native_id, a.title, a.url, a.summary, NULL AS content,
                a.author, a.hot_score, a.hot_label, a.comments_count, a.published_at,
                a.fetched_at, a.thumbnail, a.is_read, a.has_content,
                COALESCE(us.bookmarked, 0) AS is_bookmarked,
                COALESCE(us.read_later, 0) AS is_read_later,
                COALESCE(us.in_knowledge, 0) AS in_knowledge,
                ai.status AS ai_status,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.summary END AS ai_summary,
                CASE WHEN ai.status IN ('draft', 'accepted') THEN ai.score END AS ai_score
         FROM articles_fts f
         JOIN articles a ON a.rowid = f.rowid
         LEFT JOIN article_user_state us ON us.article_id = a.id
         LEFT JOIN ai_artifacts ai ON ai.article_id = a.id
         WHERE articles_fts MATCH ?
         ORDER BY a.hot_score DESC LIMIT 100",
    )
    .bind(query)
    .fetch_all(pool)
    .await?;
    let mut articles: Vec<Article> = rows.iter().map(row_to_article).collect();
    if let Some(filter) = filter {
        articles.retain(|article| matches_filter(article, filter));
    }
    Ok(articles)
}

fn build_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

/// 标记已读
pub async fn mark_read(pool: &SqlitePool, article_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE articles SET is_read = 1 WHERE id = ?")
        .bind(article_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 打开文章：标记已读并记录一次真实阅读。
pub async fn record_article_view(pool: &SqlitePool, article_id: &str) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    sqlx::query("UPDATE articles SET is_read = 1 WHERE id = ?")
        .bind(article_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query(
        "INSERT INTO article_user_state (article_id, view_count, updated_at)
         VALUES (?, 1, ?)
         ON CONFLICT(article_id) DO UPDATE SET
           view_count = view_count + 1,
           updated_at = excluded.updated_at",
    )
    .bind(article_id)
    .bind(chrono::Utc::now().timestamp())
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn mark_unread(pool: &SqlitePool, article_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE articles SET is_read = 0 WHERE id = ?")
        .bind(article_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_article_flag(
    pool: &SqlitePool,
    article_id: &str,
    flag: &str,
    value: bool,
) -> Result<(), sqlx::Error> {
    let column = match flag {
        "bookmarked" | "is_bookmarked" => "bookmarked",
        "read_later" | "is_read_later" => "read_later",
        "knowledge" | "in_knowledge" | "is_in_knowledge" => "in_knowledge",
        _ => {
            return Err(sqlx::Error::Protocol(format!(
                "unknown article flag: {flag}"
            )))
        }
    };
    let sql = format!(
        "INSERT INTO article_user_state (article_id, {column}, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(article_id) DO UPDATE SET
           {column} = excluded.{column}, updated_at = excluded.updated_at"
    );
    sqlx::query(&sql)
        .bind(article_id)
        .bind(i64::from(value))
        .bind(chrono::Utc::now().timestamp())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn save_article_note(
    pool: &SqlitePool,
    article_id: &str,
    title: &str,
    content: &str,
) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO notes (id, article_id, title, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(article_id) DO UPDATE SET
           title = excluded.title, content = excluded.content, updated_at = excluded.updated_at",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(article_id)
    .bind(title)
    .bind(content)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_article_insight(
    pool: &SqlitePool,
    article_id: &str,
) -> Result<Option<ArticleInsight>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT status, summary, key_points, impact_analysis, technologies,
                related_reading, score, error, updated_at
         FROM ai_artifacts WHERE article_id = ?",
    )
    .bind(article_id)
    .fetch_optional(pool)
    .await?;
    row.map(|row| {
        let key_points = serde_json::from_str::<Vec<String>>(&row.get::<String, _>("key_points"))
            .map_err(|error| sqlx::Error::Decode(Box::new(error)))?;
        let technologies =
            serde_json::from_str::<Vec<String>>(&row.get::<String, _>("technologies"))
                .map_err(|error| sqlx::Error::Decode(Box::new(error)))?;
        let related_reading =
            serde_json::from_str::<Vec<RelatedReading>>(&row.get::<String, _>("related_reading"))
                .map_err(|error| sqlx::Error::Decode(Box::new(error)))?;
        Ok(ArticleInsight {
            status: row.get("status"),
            summary: row.get("summary"),
            key_points,
            impact_analysis: row.get("impact_analysis"),
            technologies,
            related_reading,
            score: row.get("score"),
            error: row.get("error"),
            updated_at: Some(row.get("updated_at")),
        })
    })
    .transpose()
}

pub async fn save_article_insight(
    pool: &SqlitePool,
    article_id: &str,
    insight: &ArticleInsight,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO ai_artifacts
         (article_id, status, summary, key_points, impact_analysis, technologies,
          related_reading, score, error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(article_id) DO UPDATE SET
           status = excluded.status, summary = excluded.summary,
           key_points = excluded.key_points, impact_analysis = excluded.impact_analysis,
           technologies = excluded.technologies, related_reading = excluded.related_reading,
           score = excluded.score, error = excluded.error, updated_at = excluded.updated_at",
    )
    .bind(article_id)
    .bind(&insight.status)
    .bind(&insight.summary)
    .bind(serde_json::to_string(&insight.key_points).unwrap_or_else(|_| "[]".into()))
    .bind(&insight.impact_analysis)
    .bind(serde_json::to_string(&insight.technologies).unwrap_or_else(|_| "[]".into()))
    .bind(serde_json::to_string(&insight.related_reading).unwrap_or_else(|_| "[]".into()))
    .bind(insight.score)
    .bind(insight.error.as_deref())
    .bind(
        insight
            .updated_at
            .unwrap_or_else(|| chrono::Utc::now().timestamp()),
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_article_analytics(
    pool: &SqlitePool,
    article_id: &str,
) -> Result<ArticleAnalytics, sqlx::Error> {
    let view_count = sqlx::query("SELECT view_count FROM article_user_state WHERE article_id = ?")
        .bind(article_id)
        .fetch_optional(pool)
        .await?
        .map(|row| row.get::<i64, _>("view_count"));
    let insight = get_article_insight(pool, article_id).await?;
    let cutoff = chrono::Utc::now().timestamp() - 24 * 60 * 60;
    let trend = sqlx::query(
        "SELECT captured_at, hot_score FROM hot_snapshots
         WHERE article_id = ? AND captured_at >= ? ORDER BY captured_at ASC",
    )
    .bind(article_id)
    .bind(cutoff)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| TrendPoint {
        timestamp: row.get("captured_at"),
        value: row.get("hot_score"),
    })
    .collect();
    let article = get_article_by_id(pool, article_id).await?;
    let (keywords, domains) = article
        .as_ref()
        .map(|article| derive_article_labels(article, insight.as_ref()))
        .unwrap_or_default();
    Ok(ArticleAnalytics {
        view_count,
        ai_score: insight.as_ref().and_then(|value| value.score),
        trend,
        keywords,
        domains,
    })
}

const DOMAIN_TERMS: &[(&str, &[&str])] = &[
    (
        "人工智能",
        &[
            "ai",
            "llm",
            "openai",
            "claude",
            "机器学习",
            "深度学习",
            "大模型",
            "人工智能",
        ],
    ),
    (
        "前端与 Web",
        &[
            "react",
            "vue",
            "angular",
            "typescript",
            "javascript",
            "css",
            "html",
            "前端",
            "web",
        ],
    ),
    (
        "后端与架构",
        &[
            "rust",
            "java",
            "golang",
            "python",
            "node.js",
            "backend",
            "server",
            "微服务",
            "后端",
            "架构",
        ],
    ),
    (
        "云原生与运维",
        &[
            "kubernetes",
            "docker",
            "cloud",
            "devops",
            "linux",
            "容器",
            "云原生",
            "云计算",
            "运维",
        ],
    ),
    (
        "数据与存储",
        &[
            "database",
            "sqlite",
            "mysql",
            "postgresql",
            "redis",
            "sql",
            "数据库",
            "数据工程",
            "存储",
        ],
    ),
    (
        "安全",
        &[
            "security",
            "vulnerability",
            "cve",
            "privacy",
            "安全",
            "漏洞",
            "隐私",
        ],
    ),
    (
        "移动开发",
        &["android", "ios", "swift", "kotlin", "flutter", "移动开发"],
    ),
];

fn derive_article_labels(
    article: &Article,
    insight: Option<&ArticleInsight>,
) -> (Vec<LabelValue>, Vec<LabelValue>) {
    let text = format!(
        "{} {} {}",
        article.title,
        article.summary,
        article.content.as_deref().unwrap_or_default()
    )
    .to_lowercase();
    let mut keyword_counts: HashMap<String, i64> = HashMap::new();

    if let Some(insight) = insight {
        for technology in &insight.technologies {
            let label = technology.trim();
            if label.is_empty() {
                continue;
            }
            let normalized_label = label.to_lowercase();
            let count = count_term(&text, &normalized_label).max(1);
            keyword_counts
                .entry(normalized_label)
                .and_modify(|value| *value = (*value).max(count))
                .or_insert(count);
        }
    }

    let mut domains = Vec::new();
    for (domain, terms) in DOMAIN_TERMS {
        let mut domain_count = 0;
        for term in *terms {
            let count = count_term(&text, term);
            if count > 0 {
                domain_count += count;
                keyword_counts
                    .entry((*term).to_string())
                    .and_modify(|value| *value = (*value).max(count))
                    .or_insert(count);
            }
        }
        if domain_count > 0 {
            domains.push(LabelValue {
                label: (*domain).into(),
                value: domain_count,
            });
        }
    }

    let mut token_counts = HashMap::new();
    for token in ascii_terms(&text) {
        *token_counts.entry(token).or_insert(0) += 1;
    }
    for (token, count) in token_counts {
        keyword_counts
            .entry(token)
            .and_modify(|value| *value = (*value).max(count))
            .or_insert(count);
    }

    let mut keywords = keyword_counts
        .into_iter()
        .filter(|(label, _)| !is_stop_word(label))
        .map(|(label, value)| LabelValue { label, value })
        .collect::<Vec<_>>();
    keywords.sort_by(|left, right| {
        right
            .value
            .cmp(&left.value)
            .then_with(|| left.label.cmp(&right.label))
    });
    keywords.truncate(12);
    domains.sort_by_key(|item| std::cmp::Reverse(item.value));
    (keywords, domains)
}

fn count_term(text: &str, term: &str) -> i64 {
    if term
        .chars()
        .all(|character| character.is_ascii_alphanumeric())
    {
        text.split(|character: char| !character.is_ascii_alphanumeric())
            .filter(|token| *token == term)
            .count() as i64
    } else {
        text.match_indices(term).count() as i64
    }
}

fn ascii_terms(text: &str) -> Vec<String> {
    text.split(|character: char| {
        !(character.is_ascii_alphanumeric() || matches!(character, '+' | '#' | '.' | '-'))
    })
    .map(|token| token.trim_matches(['.', '-']).to_string())
    .filter(|token| token.len() >= 3 && token.len() <= 32)
    .filter(|token| {
        token
            .chars()
            .any(|character| character.is_ascii_alphabetic())
    })
    .collect()
}

fn is_stop_word(value: &str) -> bool {
    matches!(
        value,
        "the"
            | "and"
            | "for"
            | "with"
            | "from"
            | "this"
            | "that"
            | "into"
            | "using"
            | "new"
            | "how"
            | "what"
            | "why"
            | "are"
            | "was"
            | "not"
            | "you"
            | "your"
    )
}

/// 标记全部已读（可选按源）
pub async fn mark_all_read(pool: &SqlitePool, source: Option<&str>) -> Result<(), sqlx::Error> {
    if let Some(src) = source {
        sqlx::query("UPDATE articles SET is_read = 1 WHERE source = ?")
            .bind(src)
            .execute(pool)
            .await?;
    } else {
        sqlx::query("UPDATE articles SET is_read = 1")
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// 各源未读数
pub async fn unread_counts(pool: &SqlitePool) -> Result<UnreadCounts, sqlx::Error> {
    let rows =
        sqlx::query("SELECT source, COUNT(*) AS n FROM articles WHERE is_read = 0 GROUP BY source")
            .fetch_all(pool)
            .await?;
    let mut map = UnreadCounts::new();
    for r in rows {
        let source: String = r.get("source");
        let n: i64 = r.get("n");
        map.insert(source, n as usize);
    }
    Ok(map)
}

/// 清理旧数据：保留每源最近 7 天 / 1000 条
pub async fn cleanup_old(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let cutoff = chrono::Utc::now().timestamp() - 7 * 86400;
    // 1. Delete stale source content by publication time (or fetch time when unavailable).
    sqlx::query(
        "DELETE FROM articles
         WHERE ((published_at > 0 AND published_at < ?) OR fetched_at < ?) AND id NOT IN (
           SELECT article_id FROM article_user_state
           WHERE bookmarked = 1 OR read_later = 1 OR in_knowledge = 1
         )",
    )
    .bind(cutoff)
    .bind(cutoff)
    .execute(pool)
    .await?;
    // 2. 每源只保留最近 1000 条（窗口函数排名）
    sqlx::query(
        "DELETE FROM articles WHERE id NOT IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY source ORDER BY fetched_at DESC) AS rn
                FROM articles
            ) WHERE rn <= 1000
        ) AND id NOT IN (
            SELECT article_id FROM article_user_state
            WHERE bookmarked = 1 OR read_later = 1 OR in_knowledge = 1
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// 记录抓取日志
#[allow(dead_code)]
pub async fn log_fetch(
    pool: &SqlitePool,
    source: &str,
    started_at: i64,
    finished_at: i64,
    status: &str,
    new_count: i64,
    error: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO fetch_log (source, started_at, finished_at, status, new_count, error)
         VALUES (?,?,?,?,?,?)",
    )
    .bind(source)
    .bind(started_at)
    .bind(finished_at)
    .bind(status)
    .bind(new_count)
    .bind(error)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create in-memory database");
        sqlx::query(SCHEMA)
            .execute(&pool)
            .await
            .expect("initialize schema");
        pool
    }

    fn raw(native_id: &str, title: &str, summary: &str) -> RawArticle {
        RawArticle {
            native_id: native_id.into(),
            title: title.into(),
            url: format!("https://example.com/{native_id}"),
            summary: summary.into(),
            author: None,
            hot_score: 1,
            hot_label: "1".into(),
            comments_count: None,
            published_at: 1,
            thumbnail: None,
        }
    }

    #[tokio::test]
    async fn filters_articles_with_blacklist_and_whitelist() {
        let pool = test_pool().await;
        insert_articles(
            &pool,
            "test",
            10,
            vec![
                raw("rust", "Rust desktop apps", "Tauri guide"),
                raw("game", "Weekend games", "Rust game engine"),
                raw("web", "Web platform", "Browser news"),
            ],
        )
        .await
        .expect("insert articles");

        let filter = ArticleFilter {
            blacklist: vec!["game".into()],
            whitelist: vec!["rust".into()],
        };
        let articles = get_articles(&pool, None, 100, 0, Some(&filter))
            .await
            .expect("query articles");

        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].id, "test:rust");
    }

    #[tokio::test]
    async fn repairs_legacy_zhihu_api_urls_without_replacing_articles() {
        let pool = test_pool().await;
        let mut article = raw("123456789", "知乎问题", "问题摘要");
        article.url = "https://api.zhihu.com/questions/123456789".into();
        insert_articles(&pool, "zhihu", 100, vec![article])
            .await
            .expect("insert legacy article");

        assert_eq!(repair_legacy_article_urls(&pool).await.unwrap(), 1);
        let row = sqlx::query("SELECT id, url FROM articles WHERE id = 'zhihu:123456789'")
            .fetch_one(&pool)
            .await
            .expect("repaired article remains");
        assert_eq!(row.get::<String, _>("id"), "zhihu:123456789");
        assert_eq!(
            row.get::<String, _>("url"),
            "https://www.zhihu.com/question/123456789"
        );
    }

    #[tokio::test]
    async fn repairs_unknown_timestamps_and_summary_only_fake_cache() {
        let pool = test_pool().await;
        insert_articles(
            &pool,
            "test",
            123,
            vec![raw("legacy", "Legacy", "Source excerpt")],
        )
        .await
        .expect("insert legacy article");
        sqlx::query(
            "UPDATE articles SET published_at = 0, content = summary, has_content = 1
             WHERE id = 'test:legacy'",
        )
        .execute(&pool)
        .await
        .expect("create legacy state");

        repair_legacy_article_metadata(&pool)
            .await
            .expect("repair legacy metadata");
        let article = get_article_by_id(&pool, "test:legacy")
            .await
            .expect("query article")
            .expect("article remains");
        assert_eq!(article.published_at, 123);
        assert!(!article.has_content);
        assert_eq!(get_content(&pool, "test:legacy").await.unwrap(), None);
    }

    #[tokio::test]
    async fn persists_non_empty_article_content_and_clears_empty_content() {
        let pool = test_pool().await;
        insert_articles(
            &pool,
            "test",
            123,
            vec![raw("cached", "Cached", "Source excerpt")],
        )
        .await
        .expect("insert article");
        update_content(&pool, "test:cached", " <p>Full article body</p> ")
            .await
            .expect("cache content");
        assert_eq!(
            get_content(&pool, "test:cached").await.unwrap().as_deref(),
            Some("<p>Full article body</p>")
        );
        assert!(
            get_article_by_id(&pool, "test:cached")
                .await
                .unwrap()
                .unwrap()
                .has_content
        );

        update_content(&pool, "test:cached", "   ")
            .await
            .expect("clear empty content");
        assert_eq!(get_content(&pool, "test:cached").await.unwrap(), None);
        assert!(
            !get_article_by_id(&pool, "test:cached")
                .await
                .unwrap()
                .unwrap()
                .has_content
        );
    }

    #[tokio::test]
    async fn search_treats_user_input_as_literal_terms() {
        let pool = test_pool().await;
        insert_articles(
            &pool,
            "test",
            10,
            vec![raw("cpp", "Modern C++ patterns", "A practical guide")],
        )
        .await
        .expect("insert articles");

        let articles = search_articles(&pool, "C++", None)
            .await
            .expect("search articles");

        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].id, "test:cpp");
    }

    #[tokio::test]
    async fn persists_article_flags_and_protects_saved_articles_from_cleanup() {
        let pool = test_pool().await;
        insert_articles(
            &pool,
            "test",
            10,
            vec![raw("saved", "Saved article", "Keep this article")],
        )
        .await
        .expect("insert article");

        set_article_flag(&pool, "test:saved", "is_bookmarked", true)
            .await
            .expect("bookmark article");
        set_article_flag(&pool, "test:saved", "is_read_later", true)
            .await
            .expect("save for later");
        cleanup_old(&pool).await.expect("cleanup articles");

        let article = get_article_by_id(&pool, "test:saved")
            .await
            .expect("query article")
            .expect("saved article remains");
        assert!(article.is_bookmarked);
        assert!(article.is_read_later);
        assert!(!article.in_knowledge);
    }

    #[tokio::test]
    async fn counts_only_explicit_article_views() {
        let pool = test_pool().await;
        insert_articles(
            &pool,
            "test",
            10,
            vec![
                raw("manual-read", "Manual read state", "No view recorded"),
                raw("opened", "Opened article", "One view recorded"),
            ],
        )
        .await
        .expect("insert articles");

        mark_read(&pool, "test:manual-read")
            .await
            .expect("mark article read");
        let manual_read = get_article_by_id(&pool, "test:manual-read")
            .await
            .expect("query manually read article")
            .expect("manually read article exists");
        let manual_analytics = get_article_analytics(&pool, "test:manual-read")
            .await
            .expect("query manually read analytics");
        assert!(manual_read.is_read);
        assert_eq!(manual_analytics.view_count, None);

        record_article_view(&pool, "test:opened")
            .await
            .expect("record explicit article view");
        mark_read(&pool, "test:opened")
            .await
            .expect("repeat read-state update");
        let opened = get_article_by_id(&pool, "test:opened")
            .await
            .expect("query opened article")
            .expect("opened article exists");
        let opened_analytics = get_article_analytics(&pool, "test:opened")
            .await
            .expect("query opened article analytics");
        assert!(opened.is_read);
        assert_eq!(opened_analytics.view_count, Some(1));
    }

    #[tokio::test]
    async fn stores_insight_note_and_real_analytics() {
        let pool = test_pool().await;
        let captured_at = chrono::Utc::now().timestamp();
        insert_articles(
            &pool,
            "test",
            captured_at,
            vec![raw("insight", "AI systems", "Production inference")],
        )
        .await
        .expect("insert article");
        mark_read(&pool, "test:insight").await.expect("mark read");
        let analytics = get_article_analytics(&pool, "test:insight")
            .await
            .expect("read analytics before opening");
        assert_eq!(analytics.view_count, None);
        record_article_view(&pool, "test:insight")
            .await
            .expect("record article view");
        save_article_note(&pool, "test:insight", "Review", "A durable note")
            .await
            .expect("save note");
        let insight = ArticleInsight {
            status: "accepted".into(),
            summary: "A verified summary".into(),
            key_points: vec!["Reliable output".into()],
            impact_analysis: "Useful for production".into(),
            technologies: vec!["Rust".into(), "SQLite".into()],
            related_reading: vec![RelatedReading {
                title: "Reference".into(),
                url: Some("https://example.com/reference".into()),
            }],
            score: Some(8.5),
            error: None,
            updated_at: Some(captured_at),
        };
        save_article_insight(&pool, "test:insight", &insight)
            .await
            .expect("save insight");

        let article = get_article_by_id(&pool, "test:insight")
            .await
            .expect("query article")
            .expect("article exists");
        assert_eq!(article.ai_status.as_deref(), Some("accepted"));
        assert_eq!(article.ai_summary.as_deref(), Some("A verified summary"));
        assert_eq!(article.ai_score, Some(8.5));

        let analytics = get_article_analytics(&pool, "test:insight")
            .await
            .expect("query analytics");
        assert_eq!(analytics.view_count, Some(1));
        assert_eq!(analytics.ai_score, Some(8.5));
        assert_eq!(analytics.trend.len(), 1);
        assert!(analytics.keywords.len() >= 2);
        assert!(analytics.keywords.iter().any(|item| item.label == "rust"));
        assert_eq!(
            analytics.domains.first().map(|item| item.label.as_str()),
            Some("人工智能")
        );
    }

    #[tokio::test]
    async fn derives_keywords_and_domain_shares_without_ai_artifact() {
        let pool = test_pool().await;
        insert_articles(
            &pool,
            "test",
            chrono::Utc::now().timestamp(),
            vec![raw(
                "analytics",
                "Rust Kubernetes security",
                "Rust services run in Kubernetes containers with security controls",
            )],
        )
        .await
        .expect("insert article");
        let analytics = get_article_analytics(&pool, "test:analytics")
            .await
            .expect("derive analytics");
        assert!(analytics.keywords.iter().any(|item| item.label == "rust"));
        assert!(analytics
            .domains
            .iter()
            .any(|item| item.label == "后端与架构"));
        assert!(analytics
            .domains
            .iter()
            .any(|item| item.label == "云原生与运维"));
        assert!(analytics.domains.iter().any(|item| item.label == "安全"));
    }

    #[test]
    fn builds_safe_fts_query_for_quotes_and_spaces() {
        assert_eq!(build_fts_query("rust tauri"), "\"rust\" AND \"tauri\"");
        assert_eq!(
            build_fts_query("say \"hello\""),
            "\"say\" AND \"\"\"hello\"\"\""
        );
        assert_eq!(build_fts_query("   "), "");
    }
}
