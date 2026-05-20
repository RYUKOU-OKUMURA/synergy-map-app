use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
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
const LOGIN_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexUiEvent {
    pub kind: String,
    pub label: String,
    pub detail: Option<String>,
    pub verification_url: Option<String>,
    pub user_code: Option<String>,
    pub completion_success: Option<bool>,
    pub cancel_status: Option<String>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeInfo {
    pub command_strategy: String,
    pub resolved_path: Option<String>,
    pub real_path: Option<String>,
    pub version: Option<String>,
    pub target_triple: Option<String>,
    pub sidecar_candidate_name: Option<String>,
    pub frontend_shell_permissions: String,
    pub distribution_decision: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexStructuredOutputResult {
    pub ok: bool,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub assistant_text: String,
    pub response_json: Option<Value>,
    pub errors: Vec<String>,
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
        let codex_command = find_on_path("codex").unwrap_or_else(|| PathBuf::from("codex"));
        let mut child = Command::new(codex_command)
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

pub fn inspect_runtime() -> CodexRuntimeInfo {
    let mut warnings = Vec::new();
    let resolved_path = find_on_path("codex").map(|path| path.display().to_string());
    let real_path = resolved_path
        .as_deref()
        .and_then(|path| std::fs::canonicalize(path).ok())
        .map(|path| path.display().to_string());
    let version = command_stdout("codex", ["--version"]).or_else(|| {
        warnings.push("PATH上のcodex CLIを実行できません。".to_string());
        None
    });
    let target_triple = command_stdout("rustc", ["-Vv"]).and_then(|stdout| {
        stdout
            .lines()
            .find_map(|line| line.strip_prefix("host: "))
            .map(ToString::to_string)
    });

    if target_triple.is_none() {
        warnings.push("rustc -Vvからtarget tripleを取得できません。".to_string());
    }

    let sidecar_candidate_name = target_triple
        .as_deref()
        .map(|target| sidecar_candidate_name(target).display().to_string());

    CodexRuntimeInfo {
        command_strategy: "Phase 0はPATH上のcodex CLIをRust backendから固定引数で起動"
            .to_string(),
        resolved_path,
        real_path,
        version,
        target_triple,
        sidecar_candidate_name,
        frontend_shell_permissions: "src-tauri/capabilities/default.jsonはcore:defaultのみ。frontend shell spawn権限は付与していない。".to_string(),
        distribution_decision: "Phase 0判定は外部codex CLI前提。sidecar同梱はCodex CLIの自己完結バイナリ化とライセンス/更新方針をMVP-1開始前に再評価。".to_string(),
        warnings,
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

pub fn run_structured_output_turn(
    app: AppHandle,
    cwd: &str,
    prompt: &str,
    output_schema: Value,
) -> CodexStructuredOutputResult {
    let mut events = Vec::new();
    let mut assistant_text = String::new();
    let mut errors = Vec::new();
    let mut thread_id = None;
    let mut turn_id = None;

    let mut process = match CodexProcess::spawn() {
        Ok(process) => process,
        Err(error) => {
            return CodexStructuredOutputResult {
                ok: false,
                thread_id,
                turn_id,
                assistant_text,
                response_json: None,
                errors: vec![error],
            };
        }
    };

    let result = (|| -> Result<Value, String> {
        initialize_app_server(&mut process, &app, &mut events, &mut assistant_text)?;

        let started_thread_id =
            start_read_only_thread(&mut process, &app, cwd, &mut events, &mut assistant_text)?;
        thread_id = Some(started_thread_id.clone());

        let turn = process.request(
            "turn/start",
            json!({
                "threadId": started_thread_id,
                "input": [{
                    "type": "text",
                    "text": prompt,
                    "text_elements": [],
                }],
                "approvalPolicy": "never",
                "sandboxPolicy": {
                    "type": "readOnly",
                    "networkAccess": false,
                },
                "outputSchema": output_schema,
            }),
            REQUEST_TIMEOUT,
            &app,
            &mut events,
            &mut assistant_text,
        )?;
        turn_id = turn
            .get("turn")
            .and_then(|turn| turn.get("id"))
            .and_then(Value::as_str)
            .map(ToString::to_string);

        let turn_completed = process.wait_for_notification(
            "turn/completed",
            TURN_TIMEOUT,
            &app,
            &mut events,
            &mut assistant_text,
        )?;
        ensure_turn_completed(&turn_completed)?;

        serde_json::from_str::<Value>(assistant_text.trim())
            .map_err(|error| format!("Structured assistant message was not valid JSON: {error}"))
    })();

    let response_json = match result {
        Ok(value) => Some(value),
        Err(error) => {
            errors.push(error);
            None
        }
    };

    CodexStructuredOutputResult {
        ok: errors.is_empty() && response_json.is_some(),
        thread_id,
        turn_id,
        assistant_text,
        response_json,
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
    let initialize = initialize_app_server(process, app, events, assistant_text)?;
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

    let started_thread_id = start_read_only_thread(process, app, cwd, events, assistant_text)?;
    *thread_id = Some(started_thread_id.clone());
    push_event(
        app,
        events,
        "request",
        "thread/start完了",
        thread_id.clone(),
    );

    let turn = process.request(
        "turn/start",
        json!({
            "threadId": started_thread_id,
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
    ensure_turn_completed(&turn_completed)?;
    push_event(app, events, "stream", "turn/completedを受信", None);

    Ok(())
}

pub fn run_device_code_login_check(app: AppHandle) -> DeviceCodeLoginResult {
    let mut events = Vec::new();
    let mut errors = Vec::new();
    let warnings = Vec::new();
    let mut assistant_text = String::new();
    let mut login_id = None;
    let mut verification_url = None;
    let mut user_code = None;
    let completion_success = None;
    let cancel_status = None;

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
        initialize_app_server(&mut process, &app, &mut events, &mut assistant_text)?;

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

        Ok(())
    })();

    if let Err(error) = result {
        errors.push(error);
    }

    let stderr = process.drain_stderr();
    let ok = login_id.is_some()
        && verification_url.is_some()
        && user_code.is_some()
        && errors.is_empty();

    if ok {
        let mut background_process = process;
        let app_for_background = app.clone();
        let login_id_for_background = login_id.clone();
        thread::spawn(move || {
            wait_for_device_code_completion(
                &mut background_process,
                app_for_background,
                login_id_for_background,
            );
        });
    }

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

fn wait_for_device_code_completion(
    process: &mut CodexProcess,
    app: AppHandle,
    login_id: Option<String>,
) {
    let mut events = Vec::new();
    let mut assistant_text = String::new();
    match process.wait_for_notification(
        "account/login/completed",
        LOGIN_TIMEOUT,
        &app,
        &mut events,
        &mut assistant_text,
    ) {
        Ok(notification) => {
            let completion_success = notification.get("success").and_then(Value::as_bool);
            push_device_code_status_event(
                &app,
                "ChatGPT認証が完了",
                completion_success,
                None,
                None,
            );
        }
        Err(error) => {
            if !error.starts_with("Timed out waiting for account/login/completed.") {
                push_event(
                    &app,
                    &mut events,
                    "device-code",
                    "ChatGPT認証待機でエラー",
                    Some(error),
                );
                return;
            }

            if let Some(login_id) = login_id.as_deref() {
                match process.request(
                    "account/login/cancel",
                    json!({ "loginId": login_id }),
                    REQUEST_TIMEOUT,
                    &app,
                    &mut events,
                    &mut assistant_text,
                ) {
                    Ok(cancel) => {
                        let cancel_status = cancel
                            .get("status")
                            .and_then(Value::as_str)
                            .map(ToString::to_string);
                        push_device_code_status_event(
                            &app,
                            "ログイン待機をキャンセル",
                            None,
                            cancel_status,
                            Some(
                                "認証完了通知は未受信。必要なら認証コードを再取得してください。"
                                    .to_string(),
                            ),
                        );
                    }
                    Err(cancel_error) => {
                        push_event(
                            &app,
                            &mut events,
                            "device-code",
                            "ログイン待機キャンセルに失敗",
                            Some(cancel_error),
                        );
                    }
                }
            }
        }
    }
}

fn initialize_app_server(
    process: &mut CodexProcess,
    app: &AppHandle,
    events: &mut Vec<CodexUiEvent>,
    assistant_text: &mut String,
) -> Result<Value, String> {
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
    process.notification("initialized")?;

    Ok(initialize)
}

fn start_read_only_thread(
    process: &mut CodexProcess,
    app: &AppHandle,
    cwd: &str,
    events: &mut Vec<CodexUiEvent>,
    assistant_text: &mut String,
) -> Result<String, String> {
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

    thread
        .get("thread")
        .and_then(|thread| thread.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| "thread/start response did not include thread.id.".to_string())
}

fn ensure_turn_completed(turn_completed: &Value) -> Result<(), String> {
    let turn_status = turn_completed
        .get("turn")
        .and_then(|turn| turn.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");

    if turn_status == "completed" {
        return Ok(());
    }

    let turn_error = turn_completed
        .get("turn")
        .and_then(|turn| turn.get("error"))
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .unwrap_or("No turn error details.");

    Err(format!(
        "turn/completed returned status {turn_status}: {turn_error}"
    ))
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
        completion_success: None,
        cancel_status: None,
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
        completion_success: None,
        cancel_status: None,
    };

    let _ = app.emit(EVENT_NAME, &event);
    events.push(event);
}

fn push_device_code_status_event(
    app: &AppHandle,
    label: &str,
    completion_success: Option<bool>,
    cancel_status: Option<String>,
    detail: Option<String>,
) {
    let event = CodexUiEvent {
        kind: "device-code".to_string(),
        label: label.to_string(),
        detail,
        verification_url: None,
        user_code: None,
        completion_success,
        cancel_status,
    };

    let _ = app.emit(EVENT_NAME, &event);
}

fn command_stdout<const N: usize>(program: &str, args: [&str; N]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}

fn find_on_path(command_name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let executable_names = executable_names(command_name);

    std::env::split_paths(&path)
        .flat_map(|directory| {
            executable_names
                .iter()
                .map(move |name| directory.join(name))
        })
        .find(|path| path.is_file())
}

fn executable_names(command_name: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            format!("{command_name}.exe"),
            format!("{command_name}.cmd"),
            format!("{command_name}.bat"),
            command_name.to_string(),
        ]
    } else {
        vec![command_name.to_string()]
    }
}

fn sidecar_candidate_name(target_triple: &str) -> PathBuf {
    let file_name = if target_triple.contains("windows") {
        format!("codex-app-server-{target_triple}.exe")
    } else {
        format!("codex-app-server-{target_triple}")
    };

    PathBuf::from("binaries").join(file_name)
}
