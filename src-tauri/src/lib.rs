mod ai;
mod commands;
mod config;
mod db;
mod models;
mod scheduler;
mod sources;
mod state;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,signal=debug".into()),
        )
        .init();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // 初始化数据库
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let db_path = app_data.join("signal.db");
            let pool = tauri::async_runtime::block_on(async { db::init_pool(db_path).await })
                .expect("failed to init database");

            // 加载配置
            let config = config::load_config(app.handle());

            // 构建共享状态
            let state = state::AppState {
                db: pool.clone(),
                http: Arc::new(RwLock::new(state::build_http_client())),
                sources: sources::all_sources(),
                config: Arc::new(RwLock::new(config)),
                scheduler_handles: Mutex::new(HashMap::new()),
            };
            app.manage(state);

            // 启动抓取调度器
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                scheduler::start_scheduler(&handle);
            });

            // 启动时清理旧数据
            tauri::async_runtime::spawn(async move {
                let _ = db::cleanup_old(&pool).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_articles,
            commands::get_workspace_articles,
            commands::refresh_source,
            commands::refresh_all,
            commands::get_article_content,
            commands::get_sources,
            commands::get_config,
            commands::update_source_config,
            commands::search_articles,
            commands::mark_read,
            commands::record_article_view,
            commands::mark_unread,
            commands::mark_all_read,
            commands::get_unread_counts,
            commands::set_article_flag,
            commands::save_article_note,
            commands::get_article_insight,
            commands::generate_article_insight,
            commands::review_article_insight,
            commands::get_article_analytics,
            commands::get_ai_settings,
            commands::update_ai_settings,
            commands::set_ai_api_key,
            commands::delete_ai_api_key,
            commands::validate_ai_provider,
            commands::ai_search,
            commands::update_filter,
            commands::update_login,
            commands::open_article_url,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = _event
        {
            if !has_visible_windows {
                reopen_main_window(_app_handle);
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn reopen_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let Some(config) = app.config().app.windows.first() else {
        return;
    };
    if let Ok(window) = tauri::WebviewWindowBuilder::from_config(app, config)
        .and_then(tauri::WebviewWindowBuilder::build)
    {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
