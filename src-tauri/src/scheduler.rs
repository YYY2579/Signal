use tauri::{AppHandle, Emitter, Manager};

use crate::db;
use crate::state::{get_cookie_for_source, build_http_client_with_cookie, AppState};

/// 启动所有已启用数据源的定时调度
pub fn start_scheduler(app: &AppHandle) {
    let state = app.state::<AppState>();
    let config = state.config.read().unwrap().clone();

    // 收集需要启动的源 (id, interval)
    let to_start: Vec<(String, u64)> = state
        .sources
        .iter()
        .filter_map(|s| {
            let sc = config.sources.iter().find(|c| c.id == s.id())?;
            if sc.enabled {
                Some((s.id().to_string(), sc.interval_minutes))
            } else {
                None
            }
        })
        .collect();

    let mut handles = state.scheduler_handles.lock().unwrap();
    for (id, interval) in to_start {
        let handle = spawn_source_task(app.clone(), id, interval);
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
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_min * 60));
        loop {
            ticker.tick().await; // 首次立即触发
            fetch_one_source(&app, &source_id).await;
        }
    })
}

/// 抓取单个源：fetch_hot → 入库 → emit 事件
pub async fn fetch_one_source(app: &AppHandle, source_id: &str) {
    let state = app.state::<AppState>();
    let source = match state.sources.iter().find(|s| s.id() == source_id) {
        Some(s) => s,
        None => return,
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
            let new_count =
                db::insert_articles(&db, source_id, fetched_at, raws)
                    .await
                    .unwrap_or(0);
            let _ = app.emit(
                "articles-updated",
                serde_json::json!({ "source": source_id, "new_count": new_count }),
            );
            let _ = app.emit(
                "refresh-progress",
                serde_json::json!({ "source": source_id, "status": "done", "new_count": new_count }),
            );
        }
        Err(e) => {
            tracing::warn!("fetch {} failed: {}", source_id, e);
            let _ = app.emit(
                "refresh-progress",
                serde_json::json!({ "source": source_id, "status": "error", "error": e.to_string() }),
            );
        }
    }
}
