use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::models::AppConfig;

const STORE_FILE: &str = "settings.json";
const KEY: &str = "config";

/// 读取应用配置，不存在则返回默认值
pub fn load_config(app: &AppHandle) -> AppConfig {
    let Ok(store) = app.store(STORE_FILE) else {
        return AppConfig::default();
    };
    store
        .get(KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// 保存应用配置
pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(config).map_err(|e| e.to_string())?;
    store.set(KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
