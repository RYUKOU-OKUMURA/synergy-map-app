use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::Value;

const TURN_TIMEOUT: Duration = Duration::from_secs(120);
const PLACEHOLDER_CURSOR_API_KEY: &str = "cursor_your_key_here";

pub fn cursor_api_key_value() -> Option<String> {
    std::env::var("CURSOR_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn is_cursor_api_key_placeholder(value: &str) -> bool {
    value.trim() == PLACEHOLDER_CURSOR_API_KEY
}

pub fn cursor_api_key_configured() -> bool {
    cursor_api_key_value()
        .map(|value| !is_cursor_api_key_placeholder(&value))
        .unwrap_or(false)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnResponse {
    ok: bool,
    response_json: Option<Value>,
    errors: Vec<String>,
    duration_ms: u64,
    model: String,
}

pub struct CursorStructuredResult {
    pub ok: bool,
    pub response_json: Option<Value>,
    pub errors: Vec<String>,
    pub duration_ms: u64,
    pub model_label: String,
}

pub fn repo_root() -> Result<std::path::PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(std::path::Path::to_path_buf)
        .ok_or_else(|| "Failed to resolve repository root.".to_string())
}

pub fn command_available(command: &str, args: &[&str]) -> bool {
    Command::new(command)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub fn run_structured_turn(
    prompt: &str,
    schema: &Value,
    model_id: &str,
    cwd: &str,
) -> CursorStructuredResult {
    let started = Instant::now();
    let model_label = format!("cursor-sdk/{model_id}");

    if !cursor_api_key_configured() {
        let error = if cursor_api_key_value()
            .is_some_and(|value| is_cursor_api_key_placeholder(&value))
        {
            "CURSOR_API_KEY is still the placeholder from .env.example. Set a real key from Cursor Dashboard → Integrations.".to_string()
        } else {
            "CURSOR_API_KEY is not set.".to_string()
        };

        return CursorStructuredResult {
            ok: false,
            response_json: None,
            errors: vec![error],
            duration_ms: started.elapsed().as_millis() as u64,
            model_label,
        };
    }

    let root = match repo_root() {
        Ok(root) => root,
        Err(error) => {
            return CursorStructuredResult {
                ok: false,
                response_json: None,
                errors: vec![error],
                duration_ms: started.elapsed().as_millis() as u64,
                model_label,
            };
        }
    };

    let payload = serde_json::json!({
        "prompt": prompt,
        "schema": schema,
        "modelId": model_id,
        "cwd": cwd,
    });

    let mut child = match Command::new("pnpm")
        .current_dir(&root)
        .args(["exec", "tsx", "scripts/cursor-structured-turn.mts"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return CursorStructuredResult {
                ok: false,
                response_json: None,
                errors: vec![format!("Failed to spawn Cursor SDK bridge: {error}")],
                duration_ms: started.elapsed().as_millis() as u64,
                model_label,
            };
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(error) = stdin.write_all(payload.to_string().as_bytes()) {
            return CursorStructuredResult {
                ok: false,
                response_json: None,
                errors: vec![format!("Failed to write Cursor SDK bridge stdin: {error}")],
                duration_ms: started.elapsed().as_millis() as u64,
                model_label,
            };
        }
    }

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(error) => {
            return CursorStructuredResult {
                ok: false,
                response_json: None,
                errors: vec![format!("Failed to wait for Cursor SDK bridge: {error}")],
                duration_ms: started.elapsed().as_millis() as u64,
                model_label,
            };
        }
    };

    if started.elapsed() > TURN_TIMEOUT {
        return CursorStructuredResult {
            ok: false,
            response_json: None,
            errors: vec!["Cursor SDK bridge timed out.".to_string()],
            duration_ms: started.elapsed().as_millis() as u64,
            model_label,
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return CursorStructuredResult {
            ok: false,
            response_json: None,
            errors: vec![if stderr.is_empty() {
                format!(
                    "Cursor SDK bridge exited with status {:?}. stdout={stdout}",
                    output.status.code()
                )
            } else {
                format!("Cursor SDK bridge failed: {stderr}")
            }],
            duration_ms: started.elapsed().as_millis() as u64,
            model_label,
        };
    }

    match serde_json::from_str::<TurnResponse>(&stdout) {
        Ok(parsed) => CursorStructuredResult {
            ok: parsed.ok,
            response_json: parsed.response_json,
            errors: parsed.errors,
            duration_ms: parsed.duration_ms,
            model_label: parsed.model,
        },
        Err(error) => CursorStructuredResult {
            ok: false,
            response_json: None,
            errors: vec![format!(
                "Cursor SDK bridge returned invalid JSON: {error}. stdout={stdout}"
            )],
            duration_ms: started.elapsed().as_millis() as u64,
            model_label,
        },
    }
}
