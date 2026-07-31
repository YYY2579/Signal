use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::models::{default_source_configs, AppConfig, LoginConfig};

const STORE_FILE: &str = "settings.json";
const KEY: &str = "config";

/// 读取应用配置，不存在则返回默认值
pub fn load_config(app: &AppHandle) -> AppConfig {
    let Ok(store) = app.store(STORE_FILE) else {
        return AppConfig::default();
    };
    let config: AppConfig = store
        .get(KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let legacy_login = config.login.clone();
    let mut config = normalize_config(config);
    let secure_login = load_login();
    config.login = LoginConfig {
        juejin: secure_login.juejin.or(legacy_login.juejin),
        zhihu: secure_login.zhihu.or(legacy_login.zhihu),
    };
    if config.login.juejin.is_some() || config.login.zhihu.is_some() {
        let _ = save_login(&config.login);
        // Never leave migrated cookies in the plaintext settings store, even when
        // the operating-system credential service is temporarily unavailable.
        let _ = save_config(app, &config);
    }
    config
}

const LOGIN_SERVICE: &str = "Signal.source-login";

fn load_login() -> LoginConfig {
    LoginConfig {
        juejin: keyring::Entry::new(LOGIN_SERVICE, "juejin")
            .ok()
            .and_then(|entry| entry.get_password().ok()),
        zhihu: keyring::Entry::new(LOGIN_SERVICE, "zhihu")
            .ok()
            .and_then(|entry| entry.get_password().ok()),
    }
}

pub fn save_login(login: &LoginConfig) -> Result<(), String> {
    for (source, value) in [
        ("juejin", login.juejin.as_deref()),
        ("zhihu", login.zhihu.as_deref()),
    ] {
        let entry = keyring::Entry::new(LOGIN_SERVICE, source).map_err(|e| e.to_string())?;
        if let Some(cookie) = value.filter(|cookie| !cookie.trim().is_empty()) {
            entry
                .set_password(cookie.trim())
                .map_err(|e| e.to_string())?;
        } else {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => (),
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    Ok(())
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
    let mut persisted = config.clone();
    persisted.login = LoginConfig::default();
    let value = serde_json::to_value(persisted).map_err(|e| e.to_string())?;
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
                feed_url: None,
                platform: None,
                icon: None,
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
