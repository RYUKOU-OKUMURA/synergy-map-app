use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const EVENT_NAME: &str = "codex-app-server-event";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TURN_TIMEOUT: Duration = Duration::from_secs(120);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexUiEvent {
    pub kind: String,
    pub label: String,
    pub detail: Option<String>,
    pub verification_url: Option<String>,
    pub user_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSmokeResult {
    pub ok: bool,
    pub user_agent: Option<String>,
    pub platform_os: Option<String>,
    pub authenticated: bool,
    pub account_type: Option<String>,
    pub requires_openai_auth: bool,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub assistant_text: String,
    pub events: Vec<CodexUiEvent>,
    pub stderr: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeLoginResult {
    pub ok: bool,
    pub login_id: Option<String>,
    pub verification_url: Option<String>,
    pub user_code: Option<String>,
    pub completion_success: Option<bool>,
    pub cancel_status: Option<String>,
    pub events: Vec<CodexUiEvent>,
    pub stderr: Vec<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

enum WireMessage {
    Json(Value),
    ParseError(String),
}

struct CodexProcess {
    child: Child,
    stdin: ChildStdin,
    rx: Receiver<WireMessage>,
    stderr_rx: Receiver<String>,
    next_id: i64,
}

impl CodexProcess {
    fn spawn() -> Result<Self, String> {
        let mut child = Command::new("codex")
            .args(["app-server", "--listen", "stdio://"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to spawn codex app-server: {error}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open codex app-server stdin.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to open codex app-server stdout.".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to open codex app-server stderr.".to_string())?;

        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) => match serde_json::from_str::<Value>(&line) {
                        Ok(value) => {
                            let _ = tx.send(WireMessage::Json(value));
                        }
                        Err(error) => {
                            let _ = tx.send(WireMessage::ParseError(format!(
                                "Invalid JSON from codex app-server: {error}"
                            )));
                        }
                    },
                    Err(error) => {
                        let _ = tx.send(WireMessage::ParseError(format!(
                            "Failed to read codex app-server stdout: {error}"
                        )));
                        break;
                    }
                }
            }
        });

        let (stderr_tx, stderr_rx) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                match line {
                    Ok(line) => {
                        let _ = stderr_tx.send(line);
                    }
                    Err(error) => {
                        let _ = stderr_tx
                            .send(format!("Failed to read codex app-server stderr: {error}"));
                        break;
                    }
                }
            }
        });

        Ok(Self {
            child,
            stdin,
            rx,
            stderr_rx,
            next_id: 1,
        })
    }

    fn request(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
        app: &AppHandle,
        events: &mut Vec<CodexUiEvent>,
        assistant_text: &mut String,
    ) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;

        let request = json!({
            "id": id,
            "method": method,
            "params": params,
        });
        writeln!(self.stdin, "{request}")
            .and_then(|_| self.stdin.flush())
            .map_err(|error| format!("Failed to write {method}: {error}"))?;

        let started_at = Instant::now();
        loop {
            let remaining = timeout
                .checked_sub(started_at.elapsed())
                .ok_or_else(|| format!("Timed out waiting for {method}."))?;
            match self.rx.recv_timeout(remaining) {
                Ok(WireMessage::Json(message)) => {
                    if message.get("id").and_then(Value::as_i64) == Some(id) {
                        if let Some(error) = message.get("error") {
                            let message = error
                                .get("message")
                                .and_then(Value::as_str)
                                .unwrap_or("Unknown codex app-server error.");
                            return Err(format!("{method} failed: {message}"));
                        }

                        return Ok(message.get("result").cloned().unwrap_or(Value::Null));
                    }

                    record_wire_message(app, events, assistant_text, &message);
                }
                Ok(WireMessage::ParseError(error)) => return Err(error),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    return Err(format!("Timed out waiting for {method}."));
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("codex app-server stdout closed.".to_string());
                }
            }
        }
    }

    fn notification(&mut self, method: &str) -> Result<(), String> {
        let notification = json!({ "method": method });
        writeln!(self.stdin, "{notification}")
            .and_then(|_| self.stdin.flush())
            .map_err(|error| format!("Failed to write {method}: {error}"))
    }

    fn wait_for_notification(
        &mut self,
        target_method: &str,
        timeout: Duration,
        app: &AppHandle,
        events: &mut Vec<CodexUiEvent>,
        assistant_text: &mut String,
    ) -> Result<Value, String> {
        let started_at = Instant::now();

        loop {
            let remaining = timeout
                .checked_sub(started_at.elapsed())
                .ok_or_else(|| format!("Timed out waiting for {target_method}."))?;
            match self.rx.recv_timeout(remaining) {
                Ok(WireMessage::Json(message)) => {
                    record_wire_message(app, events, assistant_text, &message);
                    if message.get("method").and_then(Value::as_str) == Some(target_method) {
                        return Ok(message.get("params").cloned().unwrap_or(Value::Null));
                    }
                }
                Ok(WireMessage::ParseError(error)) => return Err(error),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    return Err(format!("Timed out waiting for {target_method}."));
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("codex app-server stdout closed.".to_string());
                }
            }
        }
    }

    fn drain_stderr(&mut self) -> Vec<String> {
        let mut lines = Vec::new();
        while let Ok(line) = self.stderr_rx.try_recv() {
            lines.push(line);
        }
        lines
    }
}

impl Drop for CodexProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub fn run_smoke_test(app: AppHandle, cwd: &str) -> CodexSmokeResult {
    let mut events = Vec::new();
    let mut errors = Vec::new();
    let mut assistant_text = String::new();
    let mut user_agent = None;
    let mut platform_os = None;
    let mut authenticated = false;
    let mut account_type = None;
    let mut requires_openai_auth = false;
    let mut thread_id = None;
    let mut turn_id = None;

    let mut process = match CodexProcess::spawn() {
        Ok(process) => process,
        Err(error) => {
            return CodexSmokeResult {
                ok: false,
                user_agent,
                platform_os,
                authenticated,
                account_type,
                requires_openai_auth,
                thread_id,
                turn_id,
                assistant_text,
                events,
                stderr: Vec::new(),
                errors: vec![error],
            };
        }
    };

    push_event(
        &app,
        &mut events,
        "process",
        "codex app-serverをstdioで起動",
        None,
    );

    let result = run_smoke_sequence(
        &mut process,
        &app,
        cwd,
        &mut events,
        &mut assistant_text,
        &mut user_agent,
        &mut platform_os,
        &mut authenticated,
        &mut account_type,
        &mut requires_openai_auth,
        &mut thread_id,
        &mut turn_id,
    );

    if let Err(error) = result {
        errors.push(error);
    }

    let stderr = process.drain_stderr();
    let ok = errors.is_empty()
        && authenticated
        && thread_id.is_some()
        && turn_id.is_some()
        && assistant_text.trim() == "OK";

    CodexSmokeResult {
        ok,
        user_agent,
        platform_os,
        authenticated,
        account_type,
        requires_openai_auth,
        thread_id,
        turn_id,
        assistant_text,
        events,
        stderr,
        errors,
    }
}

#[allow(clippy::too_many_arguments)]
fn run_smoke_sequence(
    process: &mut CodexProcess,
    app: &AppHandle,
    cwd: &str,
    events: &mut Vec<CodexUiEvent>,
    assistant_text: &mut String,
    user_agent: &mut Option<String>,
    platform_os: &mut Option<String>,
    authenticated: &mut bool,
    account_type: &mut Option<String>,
    requires_openai_auth: &mut bool,
    thread_id: &mut Option<String>,
    turn_id: &mut Option<String>,
) -> Result<(), String> {
    let initialize = process.request(
        "initialize",
        json!({
            "clientInfo": {
                "name": "synergy-map-phase0",
                "title": "Synergy Map Phase 0",
                "version": env!("CARGO_PKG_VERSION"),
            },
            "capabilities": {
                "experimentalApi": true,
            },
        }),
        REQUEST_TIMEOUT,
        app,
        events,
        assistant_text,
    )?;
    *user_agent = initialize
        .get("userAgent")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    *platform_os = initialize
        .get("platformOs")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    push_event(
        app,
        events,
        "request",
        "initialize完了",
        platform_os.clone(),
    );

    process.notification("initialized")?;
    push_event(app, events, "notification", "initialized通知を送信", None);

    let account = process.request(
        "account/read",
        json!({ "refreshToken": false }),
        REQUEST_TIMEOUT,
        app,
        events,
        assistant_text,
    )?;
    *requires_openai_auth = account
        .get("requiresOpenaiAuth")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if let Some(account) = account.get("account") {
        *authenticated = !account.is_null();
        *account_type = account
            .get("type")
            .and_then(Value::as_str)
            .map(ToString::to_string);
    }
    push_event(
        app,
        events,
        "request",
        "account/readで認証状態を取得",
        account_type.clone(),
    );

    let thread = process.request(
        "thread/start",
        json!({
            "cwd": cwd,
            "approvalPolicy": "never",
            "sandbox": "read-only",
            "ephemeral": true,
            "experimentalRawEvents": false,
            "persistExtendedHistory": false,
        }),
        REQUEST_TIMEOUT,
        app,
        events,
        assistant_text,
    )?;
    *thread_id = thread
        .get("thread")
        .and_then(|thread| thread.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string);
    push_event(
        app,
        events,
        "request",
        "thread/start完了",
        thread_id.clone(),
    );

    let thread_id = thread_id
        .as_deref()
        .ok_or_else(|| "thread/start response did not include thread.id.".to_string())?;
    let turn = process.request(
        "turn/start",
        json!({
            "threadId": thread_id,
            "input": [{
                "type": "text",
                "text": "Reply with exactly: OK",
                "text_elements": [],
            }],
            "approvalPolicy": "never",
            "sandboxPolicy": {
                "type": "readOnly",
                "networkAccess": false,
            },
        }),
        REQUEST_TIMEOUT,
        app,
        events,
        assistant_text,
    )?;
    *turn_id = turn
        .get("turn")
        .and_then(|turn| turn.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string);
    push_event(app, events, "request", "turn/start完了", turn_id.clone());

    let turn_completed = process.wait_for_notification(
        "turn/completed",
        TURN_TIMEOUT,
        app,
        events,
        assistant_text,
    )?;
    let turn_status = turn_completed
        .get("turn")
        .and_then(|turn| turn.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    if turn_status != "completed" {
        let turn_error = turn_completed
            .get("turn")
            .and_then(|turn| turn.get("error"))
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("No turn error details.");
        return Err(format!(
            "turn/completed returned status {turn_status}: {turn_error}"
        ));
    }
    push_event(app, events, "stream", "turn/completedを受信", None);

    Ok(())
}

pub fn run_device_code_login_check(app: AppHandle) -> DeviceCodeLoginResult {
    let mut events = Vec::new();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut assistant_text = String::new();
    let mut login_id = None;
    let mut verification_url = None;
    let mut user_code = None;
    let mut completion_success = None;
    let mut cancel_status = None;

    let mut process = match CodexProcess::spawn() {
        Ok(process) => process,
        Err(error) => {
            return DeviceCodeLoginResult {
                ok: false,
                login_id,
                verification_url,
                user_code,
                completion_success,
                cancel_status,
                events,
                stderr: Vec::new(),
                errors: vec![error],
                warnings,
            };
        }
    };

    push_event(
        &app,
        &mut events,
        "process",
        "device-code検証用app-serverを起動",
        None,
    );

    let result = (|| -> Result<(), String> {
        process.request(
            "initialize",
            json!({
                "clientInfo": {
                    "name": "synergy-map-phase0",
                    "title": "Synergy Map Phase 0",
                    "version": env!("CARGO_PKG_VERSION"),
                },
                "capabilities": {
                    "experimentalApi": true,
                },
            }),
            REQUEST_TIMEOUT,
            &app,
            &mut events,
            &mut assistant_text,
        )?;
        process.notification("initialized")?;

        let login = process.request(
            "account/login/start",
            json!({ "type": "chatgptDeviceCode" }),
            REQUEST_TIMEOUT,
            &app,
            &mut events,
            &mut assistant_text,
        )?;
        login_id = login
            .get("loginId")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        verification_url = login
            .get("verificationUrl")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        user_code = login
            .get("userCode")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        push_device_code_event(
            &app,
            &mut events,
            "verificationUrlとuserCodeを取得",
            verification_url.clone(),
            verification_url.clone(),
            user_code.clone(),
        );

        match process.wait_for_notification(
            "account/login/completed",
            LOGIN_TIMEOUT,
            &app,
            &mut events,
            &mut assistant_text,
        ) {
            Ok(notification) => {
                completion_success = notification.get("success").and_then(Value::as_bool);
            }
            Err(error) => {
                if error.starts_with("Timed out waiting for account/login/completed.") {
                    warnings.push(
                        "認証完了通知は未受信。検証用にログイン待機をキャンセルします。"
                            .to_string(),
                    );
                } else {
                    errors.push(error);
                }
                if let Some(login_id) = login_id.as_deref() {
                    let cancel = process.request(
                        "account/login/cancel",
                        json!({ "loginId": login_id }),
                        REQUEST_TIMEOUT,
                        &app,
                        &mut events,
                        &mut assistant_text,
                    )?;
                    cancel_status = cancel
                        .get("status")
                        .and_then(Value::as_str)
                        .map(ToString::to_string);
                    push_event(
                        &app,
                        &mut events,
                        "device-code",
                        "ログイン待機をキャンセル",
                        cancel_status.clone(),
                    );
                }
            }
        }

        Ok(())
    })();

    if let Err(error) = result {
        errors.push(error);
    }

    let stderr = process.drain_stderr();
    let ok = login_id.is_some()
        && verification_url.is_some()
        && user_code.is_some()
        && errors.is_empty()
        && (completion_success == Some(true) || cancel_status.as_deref() == Some("canceled"));

    DeviceCodeLoginResult {
        ok,
        login_id,
        verification_url,
        user_code,
        completion_success,
        cancel_status,
        events,
        stderr,
        errors,
        warnings,
    }
}

fn record_wire_message(
    app: &AppHandle,
    events: &mut Vec<CodexUiEvent>,
    assistant_text: &mut String,
    message: &Value,
) {
    let Some(method) = message.get("method").and_then(Value::as_str) else {
        return;
    };

    if method == "item/agentMessage/delta" {
        if let Some(delta) = message
            .get("params")
            .and_then(|params| params.get("delta"))
            .and_then(Value::as_str)
        {
            assistant_text.push_str(delta);
            push_event(
                app,
                events,
                "stream",
                "assistant delta",
                Some(delta.to_string()),
            );
            return;
        }
    }

    push_event(app, events, "stream", method, None);
}

fn push_event(
    app: &AppHandle,
    events: &mut Vec<CodexUiEvent>,
    kind: &str,
    label: &str,
    detail: Option<String>,
) {
    let event = CodexUiEvent {
        kind: kind.to_string(),
        label: label.to_string(),
        detail,
        verification_url: None,
        user_code: None,
    };

    let _ = app.emit(EVENT_NAME, &event);
    events.push(event);
}

fn push_device_code_event(
    app: &AppHandle,
    events: &mut Vec<CodexUiEvent>,
    label: &str,
    detail: Option<String>,
    verification_url: Option<String>,
    user_code: Option<String>,
) {
    let event = CodexUiEvent {
        kind: "device-code".to_string(),
        label: label.to_string(),
        detail,
        verification_url,
        user_code,
    };

    let _ = app.emit(EVENT_NAME, &event);
    events.push(event);
}
