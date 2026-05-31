use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::ai_provider::AiProviderKind;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default = "default_primary_provider")]
    pub primary_provider: AiProviderKind,
    #[serde(default = "default_fallback_enabled")]
    pub fallback_enabled: bool,
    #[serde(default = "default_cursor_model_id")]
    pub cursor_model_id: String,
    #[serde(default)]
    pub default_export_dir: Option<String>,
}

fn default_primary_provider() -> AiProviderKind {
    AiProviderKind::Codex
}

fn default_fallback_enabled() -> bool {
    true
}

fn default_cursor_model_id() -> String {
    "composer-2.5".to_string()
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            primary_provider: default_primary_provider(),
            fallback_enabled: default_fallback_enabled(),
            cursor_model_id: default_cursor_model_id(),
            default_export_dir: None,
        }
    }
}

pub fn app_settings_path(db_path: &Path) -> Result<PathBuf, String> {
    let parent = db_path
        .parent()
        .ok_or_else(|| "Database path has no parent directory.".to_string())?;
    Ok(parent.join("app-settings.json"))
}

pub fn load_ai_settings(db_path: &Path) -> AiSettings {
    let path = match app_settings_path(db_path) {
        Ok(path) => path,
        Err(_) => return AiSettings::default(),
    };

    let Ok(raw) = fs::read_to_string(&path) else {
        return AiSettings::default();
    };

    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_ai_settings(db_path: &Path, settings: &AiSettings) -> Result<(), String> {
    let path = app_settings_path(db_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_use_codex_primary() {
        let settings = AiSettings::default();
        assert_eq!(settings.primary_provider, AiProviderKind::Codex);
        assert!(settings.fallback_enabled);
        assert_eq!(settings.cursor_model_id, "composer-2.5");
        assert_eq!(settings.default_export_dir, None);
    }

    #[test]
    fn settings_persist_default_export_dir() {
        let db_path =
            std::env::temp_dir().join(format!("synergy-map-settings-{}.db", uuid::Uuid::new_v4()));
        let export_dir = std::env::temp_dir().join("synergy-map-test-exports");
        let settings = AiSettings {
            default_export_dir: Some(export_dir.display().to_string()),
            ..AiSettings::default()
        };

        save_ai_settings(&db_path, &settings).expect("settings should save");
        let loaded = load_ai_settings(&db_path);

        assert_eq!(loaded.default_export_dir, settings.default_export_dir);

        let _ = fs::remove_file(app_settings_path(&db_path).expect("path should resolve"));
    }
}
