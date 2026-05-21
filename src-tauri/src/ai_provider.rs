use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::app_settings::AiSettings;
use crate::codex_app_server;
use crate::cursor_sdk_bridge::{self, CursorStructuredResult};

pub const CODEX_MODEL_LABEL: &str = "codex-app-server";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiProviderKind {
    Codex,
    Cursor,
}

impl AiProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Cursor => "cursor",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAiResult {
    pub response_json: Option<Value>,
    pub provider_used: Option<AiProviderKind>,
    pub model_label: String,
    pub duration_ms: u64,
    pub errors: Vec<String>,
}

pub fn run_structured_ai(
    app: AppHandle,
    cwd: &str,
    prompt: &str,
    schema: Value,
    settings: &AiSettings,
) -> StructuredAiResult {
    let primary = settings.primary_provider;
    let secondary = match primary {
        AiProviderKind::Codex => AiProviderKind::Cursor,
        AiProviderKind::Cursor => AiProviderKind::Codex,
    };

    let primary_result = run_with_provider(
        app.clone(),
        cwd,
        prompt,
        &schema,
        settings,
        primary,
    );

    if primary_result.response_json.is_some() {
        return primary_result;
    }

    if !settings.fallback_enabled {
        return primary_result;
    }

    let mut errors = primary_result.errors.clone();
    errors.push(format!(
        "Primary provider ({}) failed; trying fallback ({})",
        primary.as_str(),
        secondary.as_str()
    ));

    let fallback_result = run_with_provider(app, cwd, prompt, &schema, settings, secondary);
    if fallback_result.response_json.is_some() {
        return fallback_result;
    }

    StructuredAiResult {
        response_json: None,
        provider_used: None,
        model_label: primary_result.model_label,
        duration_ms: primary_result.duration_ms + fallback_result.duration_ms,
        errors: [errors, fallback_result.errors].concat(),
    }
}

fn run_with_provider(
    app: AppHandle,
    cwd: &str,
    prompt: &str,
    schema: &Value,
    settings: &AiSettings,
    provider: AiProviderKind,
) -> StructuredAiResult {
    match provider {
        AiProviderKind::Codex => run_codex(app, cwd, prompt, schema),
        AiProviderKind::Cursor => run_cursor(prompt, schema, settings, cwd),
    }
}

fn run_codex(app: AppHandle, cwd: &str, prompt: &str, schema: &Value) -> StructuredAiResult {
    let started = std::time::Instant::now();
    let result = codex_app_server::run_structured_output_turn(app, cwd, prompt, schema.clone());

    if result.ok {
        return StructuredAiResult {
            response_json: result.response_json,
            provider_used: Some(AiProviderKind::Codex),
            model_label: CODEX_MODEL_LABEL.to_string(),
            duration_ms: started.elapsed().as_millis() as u64,
            errors: vec![],
        };
    }

    StructuredAiResult {
        response_json: None,
        provider_used: Some(AiProviderKind::Codex),
        model_label: CODEX_MODEL_LABEL.to_string(),
        duration_ms: started.elapsed().as_millis() as u64,
        errors: if result.errors.is_empty() {
            vec!["Codex structured output failed.".to_string()]
        } else {
            result.errors
        },
    }
}

fn run_cursor(
    prompt: &str,
    schema: &Value,
    settings: &AiSettings,
    cwd: &str,
) -> StructuredAiResult {
    let CursorStructuredResult {
        ok,
        response_json,
        errors,
        duration_ms,
        model_label,
    } = cursor_sdk_bridge::run_structured_turn(prompt, schema, &settings.cursor_model_id, cwd);

    StructuredAiResult {
        response_json: if ok { response_json } else { None },
        provider_used: Some(AiProviderKind::Cursor),
        model_label,
        duration_ms,
        errors: if ok { vec![] } else { errors },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_kind_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&AiProviderKind::Cursor).expect("serialize"),
            "\"cursor\""
        );
    }
}
