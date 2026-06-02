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
    #[serde(default)]
    pub map_ui_preferences: MapUiPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MapUiPreferences {
    #[serde(default = "default_bottom_drawer_open")]
    pub bottom_drawer_open: bool,
    #[serde(default = "default_bottom_drawer_height")]
    pub bottom_drawer_height: i64,
    #[serde(default = "default_show_influence")]
    pub show_influence: bool,
    #[serde(default)]
    pub layout_locked: bool,
    #[serde(default = "default_drawer_sort")]
    pub drawer_sort: String,
    #[serde(default)]
    pub show_open_questions_only: bool,
    #[serde(default = "default_context_panel_open")]
    pub context_panel_open: bool,
    #[serde(default = "default_context_panel_tab")]
    pub context_panel_tab: String,
    #[serde(default)]
    pub ai_lens_open: bool,
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

fn default_bottom_drawer_open() -> bool {
    true
}

fn default_bottom_drawer_height() -> i64 {
    260
}

fn default_show_influence() -> bool {
    true
}

fn default_drawer_sort() -> String {
    "relevance".to_string()
}

fn default_context_panel_open() -> bool {
    false
}

fn default_context_panel_tab() -> String {
    "materials".to_string()
}

impl Default for MapUiPreferences {
    fn default() -> Self {
        Self {
            bottom_drawer_open: default_bottom_drawer_open(),
            bottom_drawer_height: default_bottom_drawer_height(),
            show_influence: default_show_influence(),
            layout_locked: false,
            drawer_sort: default_drawer_sort(),
            show_open_questions_only: false,
            context_panel_open: default_context_panel_open(),
            context_panel_tab: default_context_panel_tab(),
            ai_lens_open: false,
        }
    }
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            primary_provider: default_primary_provider(),
            fallback_enabled: default_fallback_enabled(),
            cursor_model_id: default_cursor_model_id(),
            default_export_dir: None,
            map_ui_preferences: MapUiPreferences::default(),
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
        assert_eq!(settings.map_ui_preferences.bottom_drawer_height, 260);
        assert!(settings.map_ui_preferences.bottom_drawer_open);
        assert!(settings.map_ui_preferences.show_influence);
    }

    #[test]
    fn settings_persist_default_export_dir() {
        let db_path =
            std::env::temp_dir().join(format!("synergy-map-settings-{}.db", uuid::Uuid::new_v4()));
        let export_dir = std::env::temp_dir().join("synergy-map-test-exports");
        let settings = AiSettings {
            default_export_dir: Some(export_dir.display().to_string()),
            map_ui_preferences: MapUiPreferences {
                bottom_drawer_height: 420,
                layout_locked: true,
                drawer_sort: "priority".to_string(),
                ..MapUiPreferences::default()
            },
            ..AiSettings::default()
        };

        save_ai_settings(&db_path, &settings).expect("settings should save");
        let loaded = load_ai_settings(&db_path);

        assert_eq!(loaded.default_export_dir, settings.default_export_dir);
        assert_eq!(loaded.map_ui_preferences, settings.map_ui_preferences);

        let _ = fs::remove_file(app_settings_path(&db_path).expect("path should resolve"));
    }
}
