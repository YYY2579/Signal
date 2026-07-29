use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use sqlx::Row;
use std::path::PathBuf;

use crate::models::{Article, ArticleFilter, RawArticle, UnreadCounts};

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
"#;

pub async fn init_pool(db_path: PathBuf) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::query(SCHEMA).execute(&pool).await?;
    Ok(pool)
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
        .bind(&a.content)
        .bind(&a.author)
        .bind(a.hot_score)
        .bind(&a.hot_label)
        .bind(a.comments_count)
        .bind(a.published_at)
        .bind(a.fetched_at)
        .bind(&a.thumbnail)
        .execute(pool)
        .await?;
        if result.rows_affected() > 0 {
            new_count += 1;
        } else {
            // 已存在则更新热度
            sqlx::query("UPDATE articles SET hot_score=?, hot_label=?, comments_count=? WHERE id=?")
                .bind(a.hot_score)
                .bind(&a.hot_label)
                .bind(a.comments_count)
                .bind(&a.id)
                .execute(pool)
                .await?;
        }
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
        hot_label: row.get::<Option<String>, _>("hot_label").unwrap_or_default(),
        comments_count: row.get("comments_count"),
        published_at: row.get("published_at"),
        fetched_at: row.get("fetched_at"),
        thumbnail: row.get("thumbnail"),
        is_read: row.get::<i64, _>("is_read") != 0,
        has_content: row.get::<i64, _>("has_content") != 0,
    }
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
        "SELECT id, source, native_id, title, url, summary, NULL AS content, author,
                hot_score, hot_label, comments_count, published_at, fetched_at,
                thumbnail, is_read, has_content
         FROM articles WHERE source = ? ORDER BY fetched_at DESC LIMIT ? OFFSET ?"
    } else {
        "SELECT id, source, native_id, title, url, summary, NULL AS content, author,
                hot_score, hot_label, comments_count, published_at, fetched_at,
                thumbnail, is_read, has_content
         FROM articles ORDER BY fetched_at DESC LIMIT ? OFFSET ?"
    };

    let rows = if let Some(src) = source {
        sqlx::query(sql).bind(src).bind(limit).bind(offset).fetch_all(pool).await?
    } else {
        sqlx::query(sql).bind(limit).bind(offset).fetch_all(pool).await?
    };

    let mut articles: Vec<Article> = rows.iter().map(row_to_article).collect();

    // 关键词过滤（Rust 端，支持黑/白名单）
    if let Some(f) = filter {
        articles.retain(|a| {
            let text = format!("{} {}", a.title, a.summary).to_lowercase();
            // 白名单：非空时必须命中其一
            if !f.whitelist.is_empty() && !f.whitelist.iter().any(|k| text.contains(&k.to_lowercase())) {
                return false;
            }
            // 黑名单：命中任一则隐藏
            if f.blacklist.iter().any(|k| text.contains(&k.to_lowercase())) {
                return false;
            }
            true
        });
    }
    Ok(articles)
}

/// 取单篇文章正文
pub async fn get_content(pool: &SqlitePool, article_id: &str) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query("SELECT content FROM articles WHERE id = ?")
        .bind(article_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|r| r.get::<Option<String>, _>("content")))
}

/// 按 id 查单篇文章（含 content）
pub async fn get_article_by_id(
    pool: &SqlitePool,
    article_id: &str,
) -> Result<Option<Article>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, source, native_id, title, url, summary, content, author,
                hot_score, hot_label, comments_count, published_at, fetched_at,
                thumbnail, is_read, has_content
         FROM articles WHERE id = ?",
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
    sqlx::query("UPDATE articles SET content = ?, has_content = 1 WHERE id = ?")
        .bind(content)
        .bind(article_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// FTS5 全文搜索
pub async fn search_articles(pool: &SqlitePool, query: &str) -> Result<Vec<Article>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT a.id, a.source, a.native_id, a.title, a.url, a.summary, NULL AS content,
                a.author, a.hot_score, a.hot_label, a.comments_count, a.published_at,
                a.fetched_at, a.thumbnail, a.is_read, a.has_content
         FROM articles_fts f
         JOIN articles a ON a.rowid = f.rowid
         WHERE articles_fts MATCH ?
         ORDER BY a.hot_score DESC LIMIT 100",
    )
    .bind(query)
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(row_to_article).collect())
}

/// 标记已读
pub async fn mark_read(pool: &SqlitePool, article_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE articles SET is_read = 1 WHERE id = ?")
        .bind(article_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 标记全部已读（可选按源）
pub async fn mark_all_read(
    pool: &SqlitePool,
    source: Option<&str>,
) -> Result<(), sqlx::Error> {
    if let Some(src) = source {
        sqlx::query("UPDATE articles SET is_read = 1 WHERE source = ?")
            .bind(src)
            .execute(pool)
            .await?;
    } else {
        sqlx::query("UPDATE articles SET is_read = 1").execute(pool).await?;
    }
    Ok(())
}

/// 各源未读数
pub async fn unread_counts(pool: &SqlitePool) -> Result<UnreadCounts, sqlx::Error> {
    let rows = sqlx::query("SELECT source, COUNT(*) AS n FROM articles WHERE is_read = 0 GROUP BY source")
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
    sqlx::query("DELETE FROM articles WHERE fetched_at < ? AND id NOT IN (
        SELECT id FROM articles a1 WHERE a1.source = articles.source
        ORDER BY fetched_at DESC LIMIT 1000
    )")
    .bind(cutoff)
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
