use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::config;
use crate::db;
use crate::models::{Article, ArticleFilter, FilterConfig, LoginConfig, SourceConfig, UnreadCounts};
use crate::state::{build_http_client_with_cookie, get_cookie_for_source, AppState};
use crate::scheduler;

/// 查询文章列表
#[tauri::command]
pub async fn get_articles(
    state: State<'_, AppState>,
    source: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    filter: Option<ArticleFilter>,
) -> Result<Vec<Article>, String> {
    db::get_articles(
        &state.db,
        source.as_deref(),
        limit.unwrap_or(100),
        offset.unwrap_or(0),
        filter.as_ref(),
    )
    .await
    .map_err(|e| e.to_string())
}

/// 手动刷新单个源
#[tauri::command]
pub async fn refresh_source(
    app: AppHandle,
    state: State<'_, AppState>,
    source: String,
) -> Result<(), String> {
    if !state.sources.iter().any(|s| s.id() == source) {
        return Err(format!("source '{}' not found", source));
    }
    scheduler::fetch_one_source(&app, &source).await;
    Ok(())
}

/// 刷新全部源
#[tauri::command]
pub async fn refresh_all(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let ids: Vec<String> = state.sources.iter().map(|s| s.id().to_string()).collect();
    for id in ids {
        scheduler::fetch_one_source(&app, &id).await;
    }
    Ok(())
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
    let source = state
        .sources
        .iter()
        .find(|s| s.id() == article.source)
        .ok_or("source not found")?;
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
    Ok(state.config.read().unwrap().sources.clone())
}

/// 更新单个数据源配置（触发调度热重启）
#[tauri::command]
pub async fn update_source_config(
    app: AppHandle,
    state: State<'_, AppState>,
    config_in: SourceConfig,
) -> Result<(), String> {
    {
        let mut cfg = state.config.write().unwrap();
        if let Some(sc) = cfg.sources.iter_mut().find(|s| s.id == config_in.id) {
            *sc = config_in.clone();
        }
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
    db::search_articles(&state.db, &query)
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
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
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
