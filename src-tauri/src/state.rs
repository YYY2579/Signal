use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use sqlx::SqlitePool;
use tokio::task::JoinHandle;

use crate::models::AppConfig;
use crate::sources::SourceFetcher;

/// 应用全局共享状态
pub struct AppState {
    pub db: SqlitePool,
    /// 共享 HTTP client，cookie 变更时重建
    pub http: Arc<RwLock<reqwest::Client>>,
    /// 已注册的数据源
    pub sources: Vec<Box<dyn SourceFetcher>>,
    /// 应用配置（运行时可变）
    pub config: Arc<RwLock<AppConfig>>,
    /// 每源的调度任务句柄，热重启用
    pub scheduler_handles: Mutex<HashMap<String, JoinHandle<()>>>,
}

/// 构建默认 HTTP client（带 cookie store）
pub fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .cookie_store(true)
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .build()
        .expect("failed to build http client")
}
