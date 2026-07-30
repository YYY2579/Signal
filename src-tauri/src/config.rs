use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::models::{default_source_configs, AppConfig};

const STORE_FILE: &str = "settings.json";
const KEY: &str = "config";

/// 读取应用配置，不存在则返回默认值
pub fn load_config(app: &AppHandle) -> AppConfig {
    let Ok(store) = app.store(STORE_FILE) else {
        return AppConfig::default();
    };
    let config = store
        .get(KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    normalize_config(config)
}

fn normalize_config(mut config: AppConfig) -> AppConfig {
    for default in default_source_configs() {
        if let Some(existing) = config
            .sources
            .iter_mut()
            .find(|source| source.id == default.id)
        {
            existing.name = default.name;
            existing.interval_minutes = existing.interval_minutes.clamp(1, 1440);
        } else {
            config.sources.push(default);
        }
    }
    config
}

/// 保存应用配置
pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(config).map_err(|e| e.to_string())?;
    store.set(KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_config;
    use crate::models::{AppConfig, SourceConfig};

    #[test]
    fn merges_new_sources_without_resetting_existing_preferences() {
        let config = AppConfig {
            sources: vec![SourceConfig {
                id: "hackernews".into(),
                name: "Old name".into(),
                enabled: false,
                subscribed: false,
                interval_minutes: 75,
            }],
            ..AppConfig::default()
        };

        let normalized = normalize_config(config);
        let hackernews = normalized
            .sources
            .iter()
            .find(|source| source.id == "hackernews")
            .expect("existing source is retained");
        assert!(!hackernews.enabled);
        assert!(!hackernews.subscribed);
        assert_eq!(hackernews.interval_minutes, 75);
        assert_eq!(hackernews.name, "Hacker News");
        assert!(normalized
            .sources
            .iter()
            .any(|source| source.id == "github"));
        assert!(normalized
            .sources
            .iter()
            .any(|source| source.id == "leetcode"));
    }
}
