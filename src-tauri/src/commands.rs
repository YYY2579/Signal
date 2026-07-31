use std::collections::HashSet;

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::ai;
use crate::config;
use crate::db;
use crate::models::{
    AiAnswerScope, AiPreferences, AiSearchResponse, AiSettings, AiValidation, AppConfig, Article,
    ArticleAnalytics, ArticleFilter, ArticleInsight, ArticleMindMap, FilterConfig, LoginConfig,
    SourceConfig, TrendingTopic, UnreadCounts,
};
use crate::scheduler;
use crate::state::{build_http_client_with_cookie, get_cookie_for_source, AppState};

/// 查询文章列表
#[tauri::command]
pub async fn get_articles(
    state: State<'_, AppState>,
    source: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    filter: Option<ArticleFilter>,
) -> Result<Vec<Article>, String> {
    let configured_filter = {
        let config = state.config.read().map_err(|e| e.to_string())?;
        ArticleFilter {
            blacklist: config.filters.blacklist.clone(),
            whitelist: config.filters.whitelist.clone(),
        }
    };
    let effective_filter = filter.as_ref().unwrap_or(&configured_filter);

    db::get_articles(
        &state.db,
        source.as_deref(),
        limit.unwrap_or(100),
        offset.unwrap_or(0),
        Some(effective_filter),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_workspace_articles(
    state: State<'_, AppState>,
    view: String,
    source: Option<String>,
    summary_stage: Option<String>,
) -> Result<Vec<Article>, String> {
    let source_filter = source
        .as_deref()
        .map(str::trim)
        .filter(|source| !source.is_empty());
    let (filter, subscribed_sources) = {
        let config = state.config.read().map_err(|error| error.to_string())?;
        (
            ArticleFilter {
                blacklist: config.filters.blacklist.clone(),
                whitelist: config.filters.whitelist.clone(),
            },
            config
                .sources
                .iter()
                .filter(|source| source.subscribed)
                .map(|source| source.id.clone())
                .collect::<HashSet<_>>(),
        )
    };
    let articles = db::get_articles(&state.db, source_filter, 10_000, 0, Some(&filter))
        .await
        .map_err(|error| error.to_string())?;

    select_workspace_articles(
        articles,
        view.trim(),
        summary_stage.as_deref().map(str::trim),
        &subscribed_sources,
        chrono::Utc::now().timestamp(),
    )
}

fn select_workspace_articles(
    mut articles: Vec<Article>,
    view: &str,
    summary_stage: Option<&str>,
    subscribed_sources: &HashSet<String>,
    now: i64,
) -> Result<Vec<Article>, String> {
    let newest_first = |left: &Article, right: &Article| {
        right
            .fetched_at
            .cmp(&left.fetched_at)
            .then_with(|| right.published_at.cmp(&left.published_at))
            .then_with(|| left.id.cmp(&right.id))
    };

    match view {
        "dashboard" => {
            let cutoff = now.saturating_sub(24 * 60 * 60);
            articles.retain(|article| article.fetched_at >= cutoff && article.fetched_at <= now);
            articles.sort_by(newest_first);
        }
        "trending" => {
            articles.retain(|article| article.hot_score > 0);
            articles.sort_by(|left, right| {
                right
                    .hot_score
                    .cmp(&left.hot_score)
                    .then_with(|| right.published_at.cmp(&left.published_at))
                    .then_with(|| right.fetched_at.cmp(&left.fetched_at))
                    .then_with(|| left.id.cmp(&right.id))
            });
            articles.truncate(50);
        }
        "subscriptions" => {
            articles.retain(|article| subscribed_sources.contains(&article.source));
            articles.sort_by(newest_first);
        }
        "summary" => {
            match summary_stage.unwrap_or("pending") {
                "pending" => articles.retain(|article| {
                    matches!(
                        article.ai_status.as_deref(),
                        None | Some("failed" | "rejected")
                    )
                }),
                "draft" => articles.retain(|article| article.ai_status.as_deref() == Some("draft")),
                "accepted" => {
                    articles.retain(|article| article.ai_status.as_deref() == Some("accepted"))
                }
                stage => return Err(format!("unsupported summary stage '{stage}'")),
            }
            articles.sort_by(newest_first);
        }
        "later" => {
            articles.retain(|article| article.is_read_later);
            articles.sort_by(newest_first);
        }
        "knowledge" => {
            articles.retain(|article| article.in_knowledge);
            articles.sort_by(newest_first);
        }
        _ => return Err(format!("unsupported workspace view '{view}'")),
    }
    Ok(articles)
}

/// 手动刷新单个源
#[tauri::command]
pub async fn refresh_source(
    app: AppHandle,
    state: State<'_, AppState>,
    source: String,
) -> Result<(), String> {
    let is_custom = state
        .config
        .read()
        .map_err(|e| e.to_string())?
        .sources
        .iter()
        .any(|s| s.id == source && s.feed_url.is_some());
    if !state.sources.iter().any(|s| s.id() == source) && !is_custom {
        return Err(format!("source '{}' not found", source));
    }
    scheduler::fetch_one_source(&app, &source).await.map(|_| ())
}

/// 刷新全部源
#[tauri::command]
pub async fn refresh_all(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let ids: Vec<String> = state
        .config
        .read()
        .map_err(|e| e.to_string())?
        .sources
        .iter()
        .filter(|source| source.enabled)
        .filter(|source| {
            source.feed_url.is_some()
                || state
                    .sources
                    .iter()
                    .any(|registered| registered.id() == source.id)
        })
        .map(|source| source.id.clone())
        .collect();
    let mut failures = Vec::new();
    for id in ids {
        if let Err(error) = scheduler::fetch_one_source(&app, &id).await {
            failures.push(format!("{id}: {error}"));
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

/// 取文章正文：先查 DB，无则后端抓取入库
#[tauri::command]
pub async fn get_article_content(
    app: AppHandle,
    state: State<'_, AppState>,
    article_id: String,
) -> Result<Option<String>, String> {
    // 1. 先查缓存
    if let Some(content) = db::get_content(&state.db, &article_id)
        .await
        .map_err(|e| e.to_string())?
    {
        return Ok(Some(content));
    }
    // 2. 查出文章，调对应源 fetch_content
    let article = db::get_article_by_id(&state.db, &article_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("article not found")?;
    let custom_feed = state
        .config
        .read()
        .map_err(|e| e.to_string())?
        .sources
        .iter()
        .find(|source| source.id == article.source)
        .and_then(|source| source.feed_url.clone())
        .map(|url| crate::sources::feed::Feed::new(article.source.clone(), url));
    let source: &dyn crate::sources::SourceFetcher =
        if let Some(source) = state.sources.iter().find(|s| s.id() == article.source) {
            source.as_ref()
        } else if let Some(ref feed) = custom_feed {
            feed
        } else {
            return Err("source not found".into());
        };
    // 按源构建带 cookie 的 client
    let client = {
        let config = state.config.read().unwrap();
        let cookie = get_cookie_for_source(&config.login, &article.source);
        build_http_client_with_cookie(cookie)
    };
    if let Some(content) = source
        .fetch_content(&client, &article)
        .await
        .map_err(|e| e.to_string())?
    {
        db::update_content(&state.db, &article_id, &content)
            .await
            .map_err(|e| e.to_string())?;
        let _ = app.emit_content_fetched(&article_id);
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

/// 数据源配置列表
#[tauri::command]
pub async fn get_sources(state: State<'_, AppState>) -> Result<Vec<SourceConfig>, String> {
    Ok(state
        .config
        .read()
        .map_err(|error| error.to_string())?
        .sources
        .to_vec())
}

#[tauri::command]
pub async fn add_custom_source(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    url: String,
) -> Result<SourceConfig, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err("来源名称需为 1-60 个字符".into());
    }
    let parsed = reqwest::Url::parse(url.trim()).map_err(|_| "Feed 链接无效".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("仅支持 HTTP(S) RSS/Atom 链接".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Feed 链接不能包含用户凭据".into());
    }
    let client = state.http.read().map_err(|e| e.to_string())?.clone();
    let body = client
        .get(parsed.clone())
        .header(
            "Accept",
            "application/atom+xml, application/rss+xml, application/xml, text/xml",
        )
        .send()
        .await
        .map_err(|e| format!("无法读取 Feed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Feed 返回错误: {e}"))?
        .text()
        .await
        .map_err(|e| format!("无法读取 Feed 内容: {e}"))?;
    if crate::sources::feed::parse_feed(&body).is_empty() {
        return Err("链接未返回可识别的 RSS/Atom 文章，不支持普通网页".into());
    }
    let host = parsed
        .host_str()
        .unwrap_or("feed")
        .trim_start_matches("www.");
    let (platform, icon) = detect_feed_platform(host);
    let base_id: String = host
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let source = SourceConfig {
        id: format!(
            "custom_{}_{}",
            base_id.trim_matches('_'),
            chrono::Utc::now().timestamp_millis()
        ),
        name: name.into(),
        enabled: true,
        subscribed: true,
        interval_minutes: 60,
        feed_url: Some(parsed.to_string()),
        platform: Some(platform.into()),
        icon: Some(icon.into()),
    };
    {
        let mut config = state.config.write().map_err(|e| e.to_string())?;
        if config
            .sources
            .iter()
            .any(|source| source.feed_url.as_deref() == Some(parsed.as_str()))
        {
            return Err("该 Feed 已添加".into());
        }
        config.sources.push(source.clone());
        config::save_config(&app, &config)?;
    }
    scheduler::restart_source(&app, source.id.clone(), source.interval_minutes, true);
    Ok(source)
}

#[tauri::command]
pub async fn remove_custom_source(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let mut config = state.config.write().map_err(|e| e.to_string())?;
    let index = config
        .sources
        .iter()
        .position(|source| {
            source.id == id && source.id.starts_with("custom_") && source.feed_url.is_some()
        })
        .ok_or("只能删除用户添加的 Feed 来源")?;
    config.sources.remove(index);
    config::save_config(&app, &config)?;
    drop(config);
    scheduler::restart_source(&app, id, 60, false);
    Ok(())
}

fn detect_feed_platform(host: &str) -> (&'static str, &'static str) {
    fn is_domain(host: &str, domain: &str) -> bool {
        host == domain
            || host
                .strip_suffix(domain)
                .is_some_and(|prefix| prefix.ends_with('.'))
    }

    if is_domain(host, "github.com") {
        ("github", "github")
    } else if is_domain(host, "segmentfault.com") {
        ("segmentfault", "segmentfault")
    } else if is_domain(host, "oschina.net") {
        ("oschina", "oschina")
    } else if is_domain(host, "cnblogs.com") {
        ("cnblogs", "cnblogs")
    } else if is_domain(host, "ruby-china.org") {
        ("rubychina", "rubychina")
    } else if is_domain(host, "infoq.cn") {
        ("infoq", "infoq")
    } else if is_domain(host, "dev.to") {
        ("devto", "devto")
    } else if is_domain(host, "lobste.rs") {
        ("lobsters", "lobsters")
    } else if is_domain(host, "rust-lang.org") {
        ("rust", "rust")
    } else if is_domain(host, "python.org") {
        ("python", "python")
    } else if is_domain(host, "golangbridge.org") {
        ("golang", "golang")
    } else if is_domain(host, "zhihu.com") {
        ("zhihu", "zhihu")
    } else if is_domain(host, "csdn.net") {
        ("csdn", "csdn")
    } else if is_domain(host, "juejin.cn") {
        ("juejin", "juejin")
    } else if is_domain(host, "medium.com") {
        ("medium", "medium")
    } else {
        ("rss", "rss")
    }
}

#[tauri::command]
pub async fn get_trending_topics(state: State<'_, AppState>) -> Result<Vec<TrendingTopic>, String> {
    let articles = db::get_articles(&state.db, None, 10_000, 0, None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(build_trending_topics(
        articles,
        chrono::Utc::now().timestamp(),
    ))
}

fn build_trending_topics(articles: Vec<Article>, now: i64) -> Vec<TrendingTopic> {
    use std::collections::HashMap;
    const TERMS: &[&str] = &[
        "AI",
        "大模型",
        "人工智能",
        "Rust",
        "Python",
        "Java",
        "JavaScript",
        "TypeScript",
        "React",
        "Vue",
        "Linux",
        "GitHub",
        "OpenAI",
        "Claude",
        "数据库",
        "云计算",
        "开源",
        "安全",
        "芯片",
        "机器人",
        "算法",
        "前端",
        "后端",
        "Android",
        "iOS",
    ];
    let cutoff = now.saturating_sub(3 * 24 * 60 * 60);
    let recent: Vec<Article> = articles
        .into_iter()
        .filter(|a| {
            let time = if a.published_at > 0 {
                a.published_at
            } else {
                a.fetched_at
            };
            time >= cutoff && time <= now
        })
        .collect();
    let mut groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, article) in recent.iter().enumerate() {
        let text = format!("{} {}", article.title, article.summary).to_lowercase();
        for term in TERMS {
            if text.contains(&term.to_lowercase()) {
                groups.entry((*term).into()).or_default().push(index);
            }
        }
        for term in topic_tokens(&article.title) {
            groups.entry(term).or_default().push(index);
        }
    }
    let mut topics: Vec<TrendingTopic> = groups
        .into_iter()
        .filter(|(_, matches)| !matches.is_empty())
        .map(|(term, matches)| {
            let representative = matches
                .iter()
                .map(|i| &recent[*i])
                .max_by_key(|article| (article.hot_score, article.fetched_at))
                .unwrap()
                .clone();
            let mut keywords = vec![term.clone()];
            for candidate in TERMS {
                if *candidate != term
                    && matches
                        .iter()
                        .filter(|i| {
                            format!("{} {}", recent[**i].title, recent[**i].summary)
                                .to_lowercase()
                                .contains(&candidate.to_lowercase())
                        })
                        .count()
                        * 2
                        >= matches.len()
                {
                    keywords.push((*candidate).into());
                }
            }
            keywords.truncate(4);
            TrendingTopic {
                title: representative.title.clone(),
                keywords,
                article_count: matches.len(),
                article: representative,
            }
        })
        .collect();
    let mut represented = topics
        .iter()
        .map(|topic| topic.article.id.clone())
        .collect::<HashSet<_>>();
    if topics.len() < 20 {
        let mut fallback = recent.iter().collect::<Vec<_>>();
        fallback.sort_by_key(|article| {
            std::cmp::Reverse((article.hot_score, article.published_at, article.fetched_at))
        });
        for article in fallback {
            if topics.len() >= 20 || !represented.insert(article.id.clone()) {
                continue;
            }
            let mut keywords = topic_tokens(&article.title);
            if keywords.is_empty() {
                keywords.push(article.source.clone());
            }
            keywords.truncate(4);
            topics.push(TrendingTopic {
                title: article.title.clone(),
                keywords,
                article_count: 1,
                article: article.clone(),
            });
        }
    }
    topics.sort_by(|a, b| {
        b.article_count
            .cmp(&a.article_count)
            .then_with(|| b.article.hot_score.cmp(&a.article.hot_score))
    });
    topics.truncate(20);
    topics
}

fn topic_tokens(title: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    for token in title
        .to_lowercase()
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|token| (3..=24).contains(&token.len()))
        .filter(|token| {
            !matches!(
                *token,
                "the"
                    | "and"
                    | "for"
                    | "with"
                    | "from"
                    | "this"
                    | "that"
                    | "how"
                    | "why"
                    | "new"
                    | "using"
                    | "into"
                    | "your"
                    | "you"
            )
        })
    {
        if !tokens.iter().any(|existing| existing == token) {
            tokens.push(token.to_string());
        }
        if tokens.len() == 6 {
            break;
        }
    }
    tokens
}

/// 完整应用配置，供设置页初始化
#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    state
        .config
        .read()
        .map(|config| config.clone())
        .map_err(|error| error.to_string())
}

/// 更新单个数据源配置（触发调度热重启）
#[tauri::command]
pub async fn update_source_config(
    app: AppHandle,
    state: State<'_, AppState>,
    config_in: SourceConfig,
) -> Result<(), String> {
    if !(1..=1440).contains(&config_in.interval_minutes) {
        return Err("refresh interval must be between 1 and 1440 minutes".into());
    }
    {
        let mut cfg = state.config.write().unwrap();
        let sc = cfg
            .sources
            .iter_mut()
            .find(|s| s.id == config_in.id)
            .ok_or_else(|| format!("source '{}' not found", config_in.id))?;
        *sc = config_in.clone();
    }
    let cfg = state.config.read().unwrap().clone();
    config::save_config(&app, &cfg)?;
    // 热重启该源调度
    scheduler::restart_source(
        &app,
        config_in.id.clone(),
        config_in.interval_minutes,
        config_in.enabled,
    );
    Ok(())
}

/// 更新关键词过滤
#[tauri::command]
pub async fn update_filter(
    app: AppHandle,
    state: State<'_, AppState>,
    filter: FilterConfig,
) -> Result<(), String> {
    {
        let mut cfg = state.config.write().unwrap();
        cfg.filters = filter;
    }
    let cfg = state.config.read().unwrap().clone();
    config::save_config(&app, &cfg)
}

/// 更新登录态（cookie）
#[tauri::command]
pub async fn update_login(
    app: AppHandle,
    state: State<'_, AppState>,
    login: LoginConfig,
) -> Result<(), String> {
    config::save_login(&login)?;
    {
        let mut cfg = state.config.write().unwrap();
        cfg.login = login;
    }
    let cfg = state.config.read().unwrap().clone();
    config::save_config(&app, &cfg)?;
    // 重建基础 HTTP client（带 cookie store，后续按源注入 cookie）
    let new_client = build_http_client_with_cookie(None);
    *state.http.write().unwrap() = new_client;
    Ok(())
}

/// FTS5 全文搜索
#[tauri::command]
pub async fn search_articles(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<Article>, String> {
    let filter = {
        let config = state.config.read().map_err(|e| e.to_string())?;
        ArticleFilter {
            blacklist: config.filters.blacklist.clone(),
            whitelist: config.filters.whitelist.clone(),
        }
    };
    db::search_articles(&state.db, &query, Some(&filter))
        .await
        .map_err(|e| e.to_string())
}

/// 标记已读
#[tauri::command]
pub async fn mark_read(state: State<'_, AppState>, article_id: String) -> Result<(), String> {
    db::mark_read(&state.db, &article_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_unread(state: State<'_, AppState>, article_id: String) -> Result<(), String> {
    db::mark_unread(&state.db, &article_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn record_article_view(
    state: State<'_, AppState>,
    article_id: String,
) -> Result<(), String> {
    db::record_article_view(&state.db, &article_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_article_flag(
    state: State<'_, AppState>,
    article_id: String,
    flag: String,
    value: bool,
) -> Result<(), String> {
    if flag == "is_read" {
        return if value {
            db::mark_read(&state.db, &article_id).await
        } else {
            db::mark_unread(&state.db, &article_id).await
        }
        .map_err(|error| error.to_string());
    }
    db::set_article_flag(&state.db, &article_id, &flag, value)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn save_article_note(
    state: State<'_, AppState>,
    article_id: String,
    title: String,
    content: String,
) -> Result<(), String> {
    if title.trim().is_empty() || content.trim().is_empty() {
        return Err("笔记标题和内容不能为空".into());
    }
    db::save_article_note(&state.db, &article_id, title.trim(), content.trim())
        .await
        .map_err(|error| error.to_string())?;
    db::set_article_flag(&state.db, &article_id, "knowledge", true)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_article_insight(
    state: State<'_, AppState>,
    article_id: String,
) -> Result<Option<ArticleInsight>, String> {
    db::get_article_insight(&state.db, &article_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn generate_article_insight(
    state: State<'_, AppState>,
    article_id: String,
) -> Result<ArticleInsight, String> {
    let article = db::get_article_by_id(&state.db, &article_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("article not found")?;
    let preferences = state
        .config
        .read()
        .map_err(|error| error.to_string())?
        .ai
        .clone();
    let client = state
        .http
        .read()
        .map_err(|error| error.to_string())?
        .clone();
    match ai::generate_insight(&client, &preferences, &article).await {
        Ok(insight) => {
            db::save_article_insight(&state.db, &article_id, &insight)
                .await
                .map_err(|error| error.to_string())?;
            Ok(insight)
        }
        Err(error) => {
            let failed = ArticleInsight {
                status: "failed".into(),
                summary: String::new(),
                key_points: Vec::new(),
                impact_analysis: String::new(),
                technologies: Vec::new(),
                related_reading: Vec::new(),
                score: None,
                error: Some(error.clone()),
                updated_at: Some(chrono::Utc::now().timestamp()),
            };
            let _ = db::save_article_insight(&state.db, &article_id, &failed).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn get_article_mind_map(
    state: State<'_, AppState>,
    article_id: String,
) -> Result<Option<ArticleMindMap>, String> {
    db::get_article_mind_map(&state.db, &article_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_article_mind_map(
    state: State<'_, AppState>,
    article_id: String,
) -> Result<ArticleMindMap, String> {
    let article = db::get_article_by_id(&state.db, &article_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("article not found")?;
    let preferences = state.config.read().map_err(|e| e.to_string())?.ai.clone();
    let client = state.http.read().map_err(|e| e.to_string())?.clone();
    let map = ai::generate_mind_map(&client, &preferences, &article).await?;
    db::save_article_mind_map(&state.db, &article_id, &map)
        .await
        .map_err(|e| e.to_string())?;
    Ok(map)
}

#[derive(serde::Deserialize)]
struct EditableInsight {
    summary: String,
    #[serde(default)]
    key_points: Vec<String>,
    #[serde(default)]
    impact_analysis: String,
    #[serde(default)]
    technologies: Vec<String>,
    #[serde(default)]
    related_reading: Vec<crate::models::RelatedReading>,
}

#[tauri::command]
pub async fn review_article_insight(
    state: State<'_, AppState>,
    article_id: String,
    action: String,
    edited_content: Option<String>,
) -> Result<ArticleInsight, String> {
    if !matches!(action.as_str(), "accept" | "reject") {
        return Err("review action must be accept or reject".into());
    }
    let mut insight = db::get_article_insight(&state.db, &article_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or("AI insight not found")?;
    if let Some(edited_content) = edited_content {
        let edited: EditableInsight = serde_json::from_str(&edited_content)
            .map_err(|error| format!("审核内容格式错误: {error}"))?;
        if edited.summary.trim().is_empty() {
            return Err("审核后的摘要不能为空".into());
        }
        insight.summary = edited.summary;
        insight.key_points = edited.key_points;
        insight.impact_analysis = edited.impact_analysis;
        insight.technologies = edited.technologies;
        insight.related_reading = edited.related_reading;
    }
    insight.status = if action == "accept" {
        "accepted".into()
    } else {
        "rejected".into()
    };
    insight.error = None;
    insight.updated_at = Some(chrono::Utc::now().timestamp());
    db::save_article_insight(&state.db, &article_id, &insight)
        .await
        .map_err(|error| error.to_string())?;
    Ok(insight)
}

#[tauri::command]
pub async fn get_article_analytics(
    state: State<'_, AppState>,
    article_id: String,
) -> Result<ArticleAnalytics, String> {
    db::get_article_analytics(&state.db, &article_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_ai_settings(state: State<'_, AppState>) -> Result<AiSettings, String> {
    let preferences = state
        .config
        .read()
        .map_err(|error| error.to_string())?
        .ai
        .clone();
    let configured = !ai::provider_requires_api_key(&preferences.provider)?
        || ai::has_api_key(&preferences.provider)?;
    Ok(AiSettings {
        provider: preferences.provider,
        base_url: preferences.base_url,
        model: preferences.model,
        configured,
        require_review: preferences.require_review,
    })
}

#[tauri::command]
pub async fn update_ai_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    mut settings: AiPreferences,
) -> Result<(), String> {
    settings.provider = ai::canonical_provider_name(&settings.provider)?.into();
    settings.base_url = settings.base_url.trim().trim_end_matches('/').into();
    settings.model = settings.model.trim().into();
    ai::validate_base_url(&settings.base_url)?;
    if settings.model.is_empty() {
        return Err("AI 模型不能为空".into());
    }
    let previous = {
        let mut config = state.config.write().map_err(|error| error.to_string())?;
        let previous = config.ai.clone();
        config.ai = settings;
        previous
    };
    let snapshot = state
        .config
        .read()
        .map_err(|error| error.to_string())?
        .clone();
    if let Err(error) = config::save_config(&app, &snapshot) {
        state
            .config
            .write()
            .map_err(|lock_error| lock_error.to_string())?
            .ai = previous;
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn set_ai_api_key(provider: String, key: String) -> Result<(), String> {
    ai::set_api_key(&provider, &key)
}

#[tauri::command]
pub fn delete_ai_api_key(provider: String) -> Result<(), String> {
    ai::delete_api_key(&provider)
}

#[tauri::command]
pub async fn validate_ai_provider(state: State<'_, AppState>) -> Result<AiValidation, String> {
    let preferences = state
        .config
        .read()
        .map_err(|error| error.to_string())?
        .ai
        .clone();
    let client = state
        .http
        .read()
        .map_err(|error| error.to_string())?
        .clone();
    Ok(match ai::validate_provider(&client, &preferences).await {
        Ok(()) => AiValidation {
            valid: true,
            message: Some("AI 服务连接成功".into()),
        },
        Err(error) => AiValidation {
            valid: false,
            message: Some(error),
        },
    })
}

#[tauri::command]
pub async fn ai_search(
    state: State<'_, AppState>,
    query: String,
) -> Result<AiSearchResponse, String> {
    let (preferences, filter) = {
        let config = state.config.read().map_err(|error| error.to_string())?;
        (
            config.ai.clone(),
            ArticleFilter {
                blacklist: config.filters.blacklist.clone(),
                whitelist: config.filters.whitelist.clone(),
            },
        )
    };
    let matched = db::search_articles(&state.db, &query, Some(&filter))
        .await
        .map_err(|error| error.to_string())?;
    let recent = db::get_articles(&state.db, None, 80, 0, Some(&filter))
        .await
        .map_err(|error| error.to_string())?;
    let mut candidate_ids = HashSet::new();
    let candidates = matched
        .into_iter()
        .chain(recent)
        .filter(|article| candidate_ids.insert(article.id.clone()))
        .take(100)
        .collect::<Vec<_>>();
    let client = state
        .http
        .read()
        .map_err(|error| error.to_string())?
        .clone();
    let (answer, ids) = ai::search_articles(&client, &preferences, &query, &candidates).await?;
    let mut ranked = Vec::new();
    for id in ids {
        if let Some(article) = candidates.iter().find(|article| article.id == id) {
            ranked.push(article.clone());
        }
    }
    let cited_article_count = ranked.len();
    let local_candidate_count = candidates.len();
    Ok(AiSearchResponse {
        answer,
        articles: ranked,
        local_candidate_count,
        cited_article_count,
        answer_scope: if cited_article_count > 0 {
            AiAnswerScope::LocalAndModel
        } else {
            AiAnswerScope::ModelOnly
        },
        freshness_notice:
            "AI 回答不等同于实时互联网检索；时效性事实请以引用的本地采集时间和原文为准。".into(),
    })
}

/// 全部已读
#[tauri::command]
pub async fn mark_all_read(
    state: State<'_, AppState>,
    source: Option<String>,
) -> Result<(), String> {
    db::mark_all_read(&state.db, source.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// 各源未读数
#[tauri::command]
pub async fn get_unread_counts(state: State<'_, AppState>) -> Result<UnreadCounts, String> {
    db::unread_counts(&state.db)
        .await
        .map_err(|e| e.to_string())
}

/// 在系统浏览器打开原文
#[tauri::command]
pub async fn open_article_url(app: AppHandle, url: String) -> Result<(), String> {
    let url = normalize_open_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

fn normalize_open_url(input: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(input.trim()).map_err(|_| "原文链接无效".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("只能打开 HTTP 或 HTTPS 原文链接".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("原文链接不能包含用户凭据".into());
    }

    if parsed
        .host_str()
        .is_some_and(|host| host.eq_ignore_ascii_case("api.zhihu.com"))
    {
        let segments = parsed
            .path_segments()
            .map(|segments| segments.collect::<Vec<_>>())
            .unwrap_or_default();
        if let ["questions", question_id] = segments.as_slice() {
            if !question_id.is_empty() && question_id.chars().all(|ch| ch.is_ascii_digit()) {
                return Ok(format!("https://www.zhihu.com/question/{question_id}"));
            }
        }
    }

    Ok(parsed.to_string())
}

// 辅助 trait：emit content-fetched 事件
trait EmitContent {
    fn emit_content_fetched(&self, article_id: &str) -> tauri::Result<()>;
}

impl EmitContent for AppHandle {
    fn emit_content_fetched(&self, article_id: &str) -> tauri::Result<()> {
        use tauri::Emitter;
        self.emit(
            "content-fetched",
            serde_json::json!({ "article_id": article_id }),
        )
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{
        build_trending_topics, detect_feed_platform, normalize_open_url, select_workspace_articles,
    };
    use crate::models::Article;

    fn article(id: usize, source: &str, fetched_at: i64, hot_score: i64) -> Article {
        Article {
            id: format!("{source}:{id}"),
            source: source.into(),
            native_id: id.to_string(),
            title: format!("Article {id}"),
            url: format!("https://example.com/{id}"),
            summary: String::new(),
            content: None,
            author: None,
            hot_score,
            hot_label: hot_score.to_string(),
            comments_count: None,
            published_at: fetched_at,
            fetched_at,
            thumbnail: None,
            is_read: false,
            has_content: false,
            is_bookmarked: false,
            is_read_later: false,
            in_knowledge: false,
            ai_status: None,
            ai_summary: None,
            ai_score: None,
        }
    }

    #[test]
    fn dashboard_uses_current_time_for_24_hour_window() {
        let now = 200_000;
        let articles = vec![
            article(1, "github", now - 24 * 60 * 60, 1),
            article(2, "github", now - 24 * 60 * 60 - 1, 2),
            article(3, "github", now + 1, 3),
        ];

        let selected = select_workspace_articles(articles, "dashboard", None, &HashSet::new(), now)
            .expect("dashboard selection");
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].native_id, "1");
    }

    #[test]
    fn trending_returns_positive_top_50() {
        let articles = (0..60)
            .map(|id| article(id, "github", id as i64, id as i64))
            .collect();

        let selected =
            select_workspace_articles(articles, "trending", None, &HashSet::new(), 1_000)
                .expect("trending selection");
        assert_eq!(selected.len(), 50);
        assert_eq!(selected.first().map(|article| article.hot_score), Some(59));
        assert_eq!(selected.last().map(|article| article.hot_score), Some(10));
    }

    #[test]
    fn topic_stream_uses_three_day_window_and_content_volume() {
        let now = 1_000_000;
        let mut first = article(1, "github", now - 10, 10);
        first.title = "Rust AI 工具发布".into();
        let mut second = article(2, "v2ex", now - 20, 20);
        second.summary = "使用 Rust 构建 AI 服务".into();
        let mut stale = article(3, "csdn", now - 4 * 24 * 60 * 60, 999);
        stale.title = "Rust AI 旧闻".into();

        let topics = build_trending_topics(vec![first, second, stale], now);
        let rust = topics
            .iter()
            .find(|topic| topic.keywords.first().map(String::as_str) == Some("Rust"))
            .expect("Rust topic");
        assert_eq!(rust.article_count, 2);
        assert!(topics.iter().all(|topic| topic.article_count <= 2));
    }

    #[test]
    fn topic_stream_fills_top_twenty_from_recent_real_articles() {
        let now = 1_000_000;
        let articles = (0..25)
            .map(|index| {
                let mut item = article(index, "test", now - index as i64, index as i64);
                item.title = format!("Project {index} release notes");
                item
            })
            .collect();
        let topics = build_trending_topics(articles, now);
        assert_eq!(topics.len(), 20);
        assert!(topics.iter().all(|topic| !topic.keywords.is_empty()));
    }

    #[test]
    fn detects_known_feed_platform_and_falls_back_to_rss() {
        assert_eq!(detect_feed_platform("github.com"), ("github", "github"));
        assert_eq!(
            detect_feed_platform("segmentfault.com"),
            ("segmentfault", "segmentfault")
        );
        assert_eq!(
            detect_feed_platform("users.rust-lang.org"),
            ("rust", "rust")
        );
        assert_eq!(
            detect_feed_platform("discuss.python.org"),
            ("python", "python")
        );
        assert_eq!(
            detect_feed_platform("segmentfault.com.example.com"),
            ("rss", "rss")
        );
        assert_eq!(detect_feed_platform("example.com"), ("rss", "rss"));
    }

    #[test]
    fn subscriptions_use_only_subscribed_sources_and_sort_latest_first() {
        let articles = vec![
            article(1, "github", 100, 1),
            article(2, "v2ex", 300, 1),
            article(3, "github", 200, 1),
        ];
        let subscribed = HashSet::from(["github".to_string()]);

        let selected =
            select_workspace_articles(articles, "subscriptions", None, &subscribed, 1_000)
                .expect("subscription selection");
        assert_eq!(
            selected
                .iter()
                .map(|article| article.native_id.as_str())
                .collect::<Vec<_>>(),
            vec!["3", "1"]
        );
    }

    #[test]
    fn summary_stages_match_persisted_ai_status() {
        let unprocessed = article(1, "github", 500, 1);
        let mut failed = article(2, "github", 400, 1);
        failed.ai_status = Some("failed".into());
        let mut rejected = article(3, "github", 300, 1);
        rejected.ai_status = Some("rejected".into());
        let mut draft = article(4, "github", 200, 1);
        draft.ai_status = Some("draft".into());
        let mut accepted = article(5, "github", 100, 1);
        accepted.ai_status = Some("accepted".into());
        let articles = vec![unprocessed, failed, rejected, draft, accepted];

        let pending = select_workspace_articles(
            articles.clone(),
            "summary",
            Some("pending"),
            &HashSet::new(),
            1_000,
        )
        .expect("pending selection");
        let draft = select_workspace_articles(
            articles.clone(),
            "summary",
            Some("draft"),
            &HashSet::new(),
            1_000,
        )
        .expect("draft selection");
        let accepted = select_workspace_articles(
            articles,
            "summary",
            Some("accepted"),
            &HashSet::new(),
            1_000,
        )
        .expect("accepted selection");

        assert_eq!(pending.len(), 3);
        assert_eq!(
            draft.first().map(|article| article.native_id.as_str()),
            Some("4")
        );
        assert_eq!(
            accepted.first().map(|article| article.native_id.as_str()),
            Some("5")
        );
    }

    #[test]
    fn normalizes_legacy_zhihu_api_url() {
        assert_eq!(
            normalize_open_url("https://api.zhihu.com/questions/12199984100").unwrap(),
            "https://www.zhihu.com/question/12199984100"
        );
    }

    #[test]
    fn accepts_regular_web_article_urls() {
        assert_eq!(
            normalize_open_url("https://github.com/rust-lang/rust").unwrap(),
            "https://github.com/rust-lang/rust"
        );
    }

    #[test]
    fn rejects_non_web_and_credential_urls() {
        assert!(normalize_open_url("javascript:alert(1)").is_err());
        assert!(normalize_open_url("file:///tmp/article.html").is_err());
        assert!(normalize_open_url("https://user:secret@example.com/article").is_err());
    }
}
