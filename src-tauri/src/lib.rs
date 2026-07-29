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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // 初始化数据库
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let db_path = app_data.join("signal.db");
            let pool = tauri::async_runtime::block_on(async {
                db::init_pool(db_path).await
            })
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
            commands::refresh_source,
            commands::refresh_all,
            commands::get_article_content,
            commands::get_sources,
            commands::update_source_config,
            commands::search_articles,
            commands::mark_read,
            commands::mark_all_read,
            commands::get_unread_counts,
            commands::update_filter,
            commands::update_login,
            commands::open_article_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
