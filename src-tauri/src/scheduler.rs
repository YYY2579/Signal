use tauri::{AppHandle, Emitter, Manager};

use crate::db;
use crate::state::{build_http_client_with_cookie, get_cookie_for_source, AppState};

/// 启动所有已启用数据源的定时调度
pub fn start_scheduler(app: &AppHandle) {
    let state = app.state::<AppState>();
    let config = state.config.read().unwrap().clone();

    // 收集需要启动的源 (id, interval)
    let to_start: Vec<(String, u64)> = config
        .sources
        .iter()
        .filter(|source| {
            source.feed_url.is_some()
                || state
                    .sources
                    .iter()
                    .any(|registered| registered.id() == source.id)
        })
        .filter(|source| source.enabled)
        .map(|source| (source.id.clone(), source.interval_minutes))
        .collect();

    let mut handles = state.scheduler_handles.lock().unwrap();
    for (id, interval) in to_start {
        let handle = spawn_source_task(app.clone(), id.clone(), interval);
        handles.insert(id, handle);
    }
}

/// 重启单个源的调度（配置变更时调用）
pub fn restart_source(app: &AppHandle, source_id: String, interval_min: u64, enabled: bool) {
    let state = app.state::<AppState>();
    let mut handles = state.scheduler_handles.lock().unwrap();
    if let Some(old) = handles.remove(&source_id) {
        old.abort();
    }
    if enabled {
        let handle = spawn_source_task(app.clone(), source_id.clone(), interval_min);
        handles.insert(source_id, handle);
    }
}

fn spawn_source_task(
    app: AppHandle,
    source_id: String,
    interval_min: u64,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let interval_min = interval_min.clamp(1, 1440);
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_min * 60));
        loop {
            ticker.tick().await; // 首次立即触发
            if let Err(error) = fetch_one_source(&app, &source_id).await {
                tracing::warn!("scheduled fetch {} failed: {}", source_id, error);
            }
        }
    })
}

/// 抓取单个源：fetch_hot → 入库 → emit 事件
pub async fn fetch_one_source(app: &AppHandle, source_id: &str) -> Result<usize, String> {
    let state = app.state::<AppState>();
    let custom_feed = state
        .config
        .read()
        .map_err(|e| e.to_string())?
        .sources
        .iter()
        .find(|source| source.id == source_id)
        .and_then(|source| source.feed_url.clone())
        .map(|url| crate::sources::feed::Feed::new(source_id.to_string(), url));
    let source: &dyn crate::sources::SourceFetcher =
        if let Some(source) = state.sources.iter().find(|s| s.id() == source_id) {
            source.as_ref()
        } else if let Some(ref feed) = custom_feed {
            feed
        } else {
            return Err(format!("source '{source_id}' not found"));
        };

    // 读取配置中的 cookie，构建带 cookie 的 client
    let client = {
        let config = state.config.read().unwrap();
        let cookie = get_cookie_for_source(&config.login, source_id);
        build_http_client_with_cookie(cookie)
    }; // 读锁释放

    let db = state.db.clone();

    let _ = app.emit(
        "refresh-progress",
        serde_json::json!({ "source": source_id, "status": "fetching" }),
    );

    match source.fetch_hot(&client).await {
        Ok(raws) => {
            let fetched_at = chrono::Utc::now().timestamp();
            let new_count = match db::insert_articles(&db, source_id, fetched_at, raws).await {
                Ok(new_count) => new_count,
                Err(error) => {
                    let error = error.to_string();
                    let _ = app.emit(
                        "refresh-progress",
                        serde_json::json!({ "source": source_id, "status": "error", "error": error }),
                    );
                    return Err(error);
                }
            };
            db::cleanup_old(&db).await.map_err(|error| {
                let message = format!("同步完成，但清理过期内容失败: {error}");
                let _ = app.emit(
                    "refresh-progress",
                    serde_json::json!({ "source": source_id, "status": "error", "error": message }),
                );
                message
            })?;
            let _ = app.emit(
                "articles-updated",
                serde_json::json!({ "source": source_id, "new_count": new_count }),
            );
            let _ = app.emit(
                "refresh-progress",
                serde_json::json!({ "source": source_id, "status": "done", "new_count": new_count }),
            );
            Ok(new_count)
        }
        Err(e) => {
            let error = e.to_string();
            let _ = app.emit(
                "refresh-progress",
                serde_json::json!({ "source": source_id, "status": "error", "error": error }),
            );
            Err(error)
        }
    }
}
