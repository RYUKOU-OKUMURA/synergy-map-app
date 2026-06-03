use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{DragDropEvent, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

mod ai_provider;
mod ai_schema;
mod app_settings;
mod codex_app_server;
mod cursor_sdk_bridge;
mod env_config;
mod mvp1;
mod source_reader;

use app_settings::{load_ai_settings, save_ai_settings, AiSettings};
use cursor_sdk_bridge::{cursor_api_key_configured, repo_root, run_structured_turn};

use ai_schema::{ai_analysis_json_schema, validate_ai_analysis_json, SCHEMA_VERSION};
use codex_app_server::{CodexRuntimeInfo, CodexSmokeResult, DeviceCodeLoginResult};
use source_reader::{read_source_file, ReadSourceDraft};

pub(crate) struct DbState {
    db_path: PathBuf,
}

#[derive(Default)]
struct DropImportState {
    pending_paths: Mutex<HashMap<PathBuf, Instant>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    client_name: Option<String>,
    industry: Option<String>,
    description: Option<String>,
    memo: Option<String>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageInfo {
    db_path: String,
    app_data_dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportSourceResult {
    source_file_id: String,
    file_name: String,
    file_type: String,
    status: String,
    error: Option<String>,
    chunk_count: usize,
    chunks: Vec<SourceChunk>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceChunk {
    id: String,
    project_id: String,
    source_file_id: String,
    chunk_index: i64,
    content_path: String,
    content_hash: String,
    page_number: Option<i64>,
    sheet_name: Option<String>,
    row_start: Option<i64>,
    row_end: Option<i64>,
    column_start: Option<i64>,
    column_end: Option<i64>,
    heading_path: Option<String>,
    metadata_json: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiSchemaPocResult {
    ok: bool,
    ai_run_id: Option<String>,
    schema_name: String,
    schema_version: String,
    response_summary: Option<String>,
    request_summary_path: Option<String>,
    response_json_path: Option<String>,
    errors: Vec<String>,
}

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "mvp1",
        sql: include_str!("../migrations/0002_mvp1.sql"),
    },
    Migration {
        version: 3,
        name: "business_impact_view",
        sql: include_str!("../migrations/0003_business_impact_view.sql"),
    },
    Migration {
        version: 4,
        name: "phase1_daily_use",
        sql: include_str!("../migrations/0004_phase1_daily_use.sql"),
    },
    Migration {
        version: 5,
        name: "center_node",
        sql: include_str!("../migrations/0005_center_node.sql"),
    },
    Migration {
        version: 6,
        name: "ai_lens_items",
        sql: include_str!("../migrations/0006_ai_lens_items.sql"),
    },
];

const LEGACY_INITIAL_MIGRATION_CHECKSUM: &str = "0001_initial_v1";

const PHASE0_SAMPLE_FILES: &[&str] = &[
    "company-overview.pdf",
    "financial-summary.pdf",
    "table-layout.pdf",
    "scanned-placeholder.pdf",
    "sample-workbook.xlsx",
    "channels-utf8.csv",
    "channels-shift-jis.csv",
    "hearing-memo.md",
    "long-hearing-note.txt",
];

const AI_SCHEMA_NAME: &str = "AiAnalysisOutput";
const AI_RUN_TYPE: &str = "phase0_schema_poc";
const AI_RUN_MODEL: &str = "codex-app-server";
const AI_REQUEST_SUMMARY: &str =
    "Phase 0 sample map analysis request. Full source chunks are not included.";
const DROP_IMPORT_TTL: Duration = Duration::from_secs(20);

fn now_rfc3339() -> Result<String, String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| error.to_string())
}

fn hash_text(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn empty_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn migration_checksum(migration: &Migration) -> String {
    hash_text(migration.sql)
}

fn workspace_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn app_data_dir_from_db(db_path: &Path) -> Result<&Path, String> {
    db_path
        .parent()
        .ok_or_else(|| "DB path has no parent directory.".to_string())
}

fn open_connection(db_path: &PathBuf) -> Result<Connection, String> {
    let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn run_migrations(connection: &mut Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS _migrations (
                version INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )
        .map_err(|error| error.to_string())?;
    ensure_migrations_checksum_column(connection)?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    for migration in MIGRATIONS {
        let expected_checksum = migration_checksum(migration);
        let applied_migration = transaction
            .query_row(
                "SELECT name, checksum FROM _migrations WHERE version = ?1",
                [migration.version],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        if let Some((name, checksum)) = applied_migration {
            if name != migration.name {
                return Err(format!(
                    "Migration drift detected for version {}.",
                    migration.version
                ));
            }

            if checksum == expected_checksum {
                continue;
            }

            if is_legacy_migration_checksum(migration, &checksum) {
                transaction
                    .execute(
                        "UPDATE _migrations SET checksum = ?1 WHERE version = ?2",
                        params![expected_checksum, migration.version],
                    )
                    .map_err(|error| error.to_string())?;
                continue;
            }

            return Err(format!(
                "Migration drift detected for version {}.",
                migration.version
            ));
        }

        transaction
            .execute_batch(migration.sql)
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO _migrations (version, name, checksum, applied_at) VALUES (?1, ?2, ?3, ?4)",
                params![
                    migration.version,
                    migration.name,
                    expected_checksum,
                    now_rfc3339()?
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())
}

fn is_legacy_migration_checksum(migration: &Migration, checksum: &str) -> bool {
    migration.version == 1
        && migration.name == "initial"
        && checksum == LEGACY_INITIAL_MIGRATION_CHECKSUM
}

fn ensure_migrations_checksum_column(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("PRAGMA table_info(_migrations)")
        .map_err(|error| error.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if columns.iter().any(|column| column == "checksum") {
        return Ok(());
    }

    connection
        .execute("ALTER TABLE _migrations ADD COLUMN checksum TEXT", [])
        .map_err(|error| error.to_string())?;

    for migration in MIGRATIONS {
        connection
            .execute(
                "UPDATE _migrations SET checksum = ?1 WHERE version = ?2 AND name = ?3",
                params![
                    migration_checksum(migration),
                    migration.version,
                    migration.name
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn init_database(db_path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut connection = open_connection(db_path)?;
    run_migrations(&mut connection)
}

fn row_to_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        client_name: row.get("client_name")?,
        industry: row.get("industry")?,
        description: row.get("description")?,
        memo: row.get("memo")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

fn get_project_by_id(connection: &Connection, id: &str) -> Result<Project, String> {
    connection
        .query_row(
            "SELECT id, name, client_name, industry, description, memo, created_at, updated_at, archived_at
             FROM projects
             WHERE id = ?1",
            [id],
            row_to_project,
        )
        .map_err(|error| error.to_string())
}

fn project_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    app_data_dir.join("projects").join(project_id)
}

fn source_chunks_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("extracted")
}

fn source_files_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("sources")
}

fn file_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(hex::encode(Sha256::digest(&bytes)))
}

fn sanitized_file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("source")
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            value => value,
        })
        .collect()
}

fn is_supported_source_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "pdf" | "csv" | "xlsx" | "xls" | "ods" | "md" | "markdown" | "txt" | "text"
    )
}

fn canonical_import_path(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| error.to_string())
}

fn register_dropped_paths(drop_state: &DropImportState, paths: &[PathBuf]) {
    let Ok(mut pending_paths) = drop_state.pending_paths.lock() else {
        return;
    };
    let now = Instant::now();

    for path in paths {
        if let Ok(canonical_path) = canonical_import_path(path) {
            pending_paths.insert(canonical_path, now);
        }
    }
}

fn consume_dropped_paths(
    drop_state: &DropImportState,
    paths: &[String],
) -> Result<Vec<PathBuf>, String> {
    let mut pending_paths = drop_state
        .pending_paths
        .lock()
        .map_err(|_| "Drop import state is unavailable.".to_string())?;
    let mut canonical_paths = Vec::with_capacity(paths.len());
    let now = Instant::now();

    pending_paths.retain(|_, registered_at| now.duration_since(*registered_at) <= DROP_IMPORT_TTL);

    for path in paths {
        let canonical_path = canonical_import_path(Path::new(path))?;
        if pending_paths.remove(&canonical_path).is_none() {
            return Err("Files must be imported from the current drag-and-drop event.".to_string());
        }
        canonical_paths.push(canonical_path);
    }

    Ok(canonical_paths)
}

fn source_chunk_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceChunk> {
    Ok(SourceChunk {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        source_file_id: row.get("source_file_id")?,
        chunk_index: row.get("chunk_index")?,
        content_path: String::new(),
        content_hash: row.get("content_hash")?,
        page_number: row.get("page_number")?,
        sheet_name: row.get("sheet_name")?,
        row_start: row.get("row_start")?,
        row_end: row.get("row_end")?,
        column_start: row.get("column_start")?,
        column_end: row.get("column_end")?,
        heading_path: row.get("heading_path")?,
        metadata_json: row.get("metadata_json")?,
        created_at: row.get("created_at")?,
    })
}

#[tauri::command]
fn create_project(
    state: State<'_, DbState>,
    name: String,
    client_name: Option<String>,
    industry: Option<String>,
    description: Option<String>,
    memo: Option<String>,
) -> Result<Project, String> {
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        return Err("Project name is required.".to_string());
    }

    let connection = open_connection(&state.db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;

    connection
        .execute(
            "INSERT INTO projects (
                id, name, client_name, industry, description, memo, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                trimmed_name,
                empty_to_none(client_name),
                empty_to_none(industry),
                empty_to_none(description),
                empty_to_none(memo),
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    get_project_by_id(&connection, &id)
}

#[tauri::command]
fn list_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let connection = open_connection(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, name, client_name, industry, description, memo, created_at, updated_at, archived_at
             FROM projects
             WHERE archived_at IS NULL
             ORDER BY updated_at DESC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], row_to_project)
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_storage_info(state: State<'_, DbState>) -> Result<StorageInfo, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?;

    Ok(StorageInfo {
        db_path: state.db_path.display().to_string(),
        app_data_dir: app_data_dir.display().to_string(),
    })
}

#[tauri::command]
fn import_sample_source(
    state: State<'_, DbState>,
    project_id: String,
    sample_file_name: String,
) -> Result<ImportSourceResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?;
    let sample_file_name = PHASE0_SAMPLE_FILES
        .iter()
        .find(|allowed_name| **allowed_name == sample_file_name)
        .ok_or_else(|| "Sample file is not allowed.".to_string())?;
    let sample_path = workspace_dir()
        .join("samples")
        .join("phase-0")
        .join(sample_file_name);

    import_source_path(&state.db_path, app_data_dir, &project_id, &sample_path)
}

#[tauri::command]
fn import_source_files(
    state: State<'_, DbState>,
    drop_state: State<'_, DropImportState>,
    project_id: String,
    paths: Vec<String>,
) -> Result<Vec<ImportSourceResult>, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?;

    if paths.is_empty() {
        return Err("Import paths are required.".to_string());
    }

    let source_paths = consume_dropped_paths(&drop_state, &paths)?;

    source_paths
        .iter()
        .map(|source_path| {
            import_source_path(&state.db_path, app_data_dir, &project_id, source_path)
        })
        .collect()
}

#[tauri::command]
fn import_source_files_from_dialog(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Vec<ImportSourceResult>, String> {
    let selected_paths = app
        .dialog()
        .file()
        .add_filter(
            "資料ファイル",
            &["pdf", "csv", "xlsx", "xls", "ods", "md", "markdown", "txt"],
        )
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.into_path().map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, _>>()?;

    if selected_paths.is_empty() {
        return Ok(Vec::new());
    }

    let app_data_dir = app_data_dir_from_db(&state.db_path)?;
    selected_paths
        .iter()
        .map(|source_path| {
            import_source_path(&state.db_path, app_data_dir, &project_id, source_path)
        })
        .collect()
}

#[tauri::command]
fn list_source_chunks(
    state: State<'_, DbState>,
    source_file_id: String,
) -> Result<Vec<SourceChunk>, String> {
    let connection = open_connection(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, source_file_id, chunk_index, content_hash,
                    page_number, sheet_name, row_start, row_end, column_start, column_end,
                    heading_path, metadata_json, created_at
             FROM source_chunks
             WHERE source_file_id = ?1
             ORDER BY chunk_index ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([source_file_id], source_chunk_from_row)
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn run_codex_smoke_test(app: tauri::AppHandle) -> CodexSmokeResult {
    let cwd = workspace_dir();

    codex_app_server::run_smoke_test(app, &cwd.display().to_string())
}

#[tauri::command]
fn run_codex_device_code_check(app: tauri::AppHandle) -> DeviceCodeLoginResult {
    codex_app_server::run_device_code_login_check(app)
}

#[tauri::command]
fn get_codex_runtime_info() -> CodexRuntimeInfo {
    codex_app_server::inspect_runtime()
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err("許可されていないURLです。".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&url);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &url]);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&url);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("外部ブラウザを開けませんでした: {error}"))
}

fn is_allowed_external_url(url: &str) -> bool {
    url == "https://auth.openai.com/codex/device"
        || url.starts_with("https://chatgpt.com/")
        || url.starts_with("https://chat.openai.com/")
        || url.starts_with("https://cursor.com/")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorSdkStatus {
    api_key_configured: bool,
    pnpm_available: bool,
    tsx_available: bool,
    repo_root: Option<String>,
    script_exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorSdkSmokeResult {
    ok: bool,
    duration_ms: u64,
    model: Option<String>,
    errors: Vec<String>,
}

#[tauri::command]
fn get_ai_settings(state: State<'_, DbState>) -> AiSettings {
    load_ai_settings(&state.db_path)
}

#[tauri::command]
fn save_ai_settings_command(
    state: State<'_, DbState>,
    settings: AiSettings,
) -> Result<AiSettings, String> {
    save_ai_settings(&state.db_path, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn select_default_export_dir(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<AiSettings, String> {
    let selected_folder = app.dialog().file().blocking_pick_folder();
    let Some(selected_folder) = selected_folder else {
        return Ok(load_ai_settings(&state.db_path));
    };
    let selected_path = selected_folder
        .into_path()
        .map_err(|error| error.to_string())?;
    let mut settings = load_ai_settings(&state.db_path);
    settings.default_export_dir = Some(selected_path.display().to_string());
    save_ai_settings(&state.db_path, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn open_export_path(state: State<'_, DbState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let target = target
        .canonicalize()
        .map_err(|error| format!("出力先を確認できませんでした: {error}"))?;
    let open_target = if target.is_file() {
        target
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "出力ファイルの親フォルダを確認できませんでした。".to_string())?
    } else {
        target.clone()
    };

    if !is_allowed_export_path(&state.db_path, &target)? {
        return Err("許可された出力フォルダ外のパスは開けません。".to_string());
    }

    open_path_with_os(&open_target)
}

fn is_allowed_export_path(db_path: &Path, target: &Path) -> Result<bool, String> {
    let mut bases = vec![app_data_dir_from_db(db_path)?
        .canonicalize()
        .map_err(|error| error.to_string())?];

    if let Some(default_export_dir) = load_ai_settings(db_path).default_export_dir {
        let path = PathBuf::from(default_export_dir);
        if let Ok(canonical) = path.canonicalize() {
            bases.push(canonical);
        }
    }

    Ok(bases.iter().any(|base| target.starts_with(base)))
}

fn open_path_with_os(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &path.display().to_string()]);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("出力先を開けませんでした: {error}"))
}

#[tauri::command]
fn get_cursor_sdk_status() -> CursorSdkStatus {
    let root = repo_root().ok();
    let script_exists = root
        .as_ref()
        .map(|path| path.join("scripts/cursor-structured-turn.mts").is_file())
        .unwrap_or(false);

    CursorSdkStatus {
        api_key_configured: cursor_api_key_configured(),
        pnpm_available: cursor_sdk_bridge::command_available("pnpm", &["--version"]),
        tsx_available: cursor_sdk_bridge::command_available("pnpm", &["exec", "tsx", "--version"]),
        repo_root: root.map(|path| path.display().to_string()),
        script_exists,
    }
}

#[tauri::command]
fn run_cursor_sdk_smoke_test(state: State<'_, DbState>) -> CursorSdkSmokeResult {
    let settings = load_ai_settings(&state.db_path);
    let cwd = workspace_dir();
    let prompt = format!(
        "Synergy Map接続確認です。schemaVersionは必ず{}にしてください。summaryは1文で返してください。",
        SCHEMA_VERSION
    );
    let result = run_structured_turn(
        &prompt,
        &ai_analysis_json_schema(),
        &settings.cursor_model_id,
        &cwd.display().to_string(),
    );

    CursorSdkSmokeResult {
        ok: result.ok,
        duration_ms: result.duration_ms,
        model: if result.ok {
            Some(result.model_label)
        } else {
            None
        },
        errors: result.errors,
    }
}

#[tauri::command]
fn run_ai_schema_poc(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    project_id: String,
) -> Result<AiSchemaPocResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?;
    let connection = open_connection(&state.db_path)?;
    let project = get_project_by_id(&connection, &project_id)?;
    let prompt = format!(
        "Sample FoodsのPhase 0検証です。既存顧客、店舗接点、EC接点、商品連携、売上効果の関係から、事業機会を日本語で短く分析してください。schemaVersionは必ず{}にしてください。",
        SCHEMA_VERSION
    );
    let cwd = workspace_dir();
    let settings = load_ai_settings(&state.db_path);
    let structured = ai_provider::run_structured_ai(
        app,
        &cwd.display().to_string(),
        &prompt,
        ai_analysis_json_schema(),
        &settings,
    );

    if let Some(response_json) = structured.response_json.as_ref() {
        match validate_ai_analysis_json(response_json) {
            Ok(output) => {
                let saved_run = save_ai_run_with_model(
                    &state.db_path,
                    app_data_dir,
                    &project.id,
                    None,
                    &prompt,
                    response_json,
                    &structured.model_label,
                )?;

                Ok(ai_schema_poc_success(saved_run, output.summary))
            }
            Err(error) => Ok(ai_schema_poc_failure(vec![error])),
        }
    } else {
        Ok(ai_schema_poc_failure(structured.errors))
    }
}

fn import_source_path(
    db_path: &PathBuf,
    app_data_dir: &Path,
    project_id: &str,
    source_path: &Path,
) -> Result<ImportSourceResult, String> {
    let mut connection = open_connection(db_path)?;

    get_project_by_id(&connection, project_id)?;
    if !source_path.is_file() {
        return Err(format!(
            "Source file was not found: {}",
            source_path.display()
        ));
    }
    if !is_supported_source_path(source_path) {
        return Err(
            "Unsupported source file type. PDF, CSV, XLSX, Markdown, Textのみ対応します。"
                .to_string(),
        );
    }

    let source_file_id = Uuid::new_v4().to_string();
    let copied_file_dir = source_files_dir(app_data_dir, project_id).join(&source_file_id);
    fs::create_dir_all(&copied_file_dir).map_err(|error| error.to_string())?;
    let copied_source_path = copied_file_dir.join(sanitized_file_name(source_path));
    fs::copy(source_path, &copied_source_path).map_err(|error| error.to_string())?;
    let source_hash = file_hash(&copied_source_path)?;

    let draft = read_source_file(&copied_source_path);
    let now = now_rfc3339()?;
    let file_name = draft.file_name.clone();
    let file_type = draft.file_type.clone();
    let status = draft.status.clone();
    let error = draft.error.clone();
    let chunks_dir = source_chunks_dir(app_data_dir, project_id).join(&source_file_id);

    fs::create_dir_all(&chunks_dir).map_err(|error| error.to_string())?;

    let result = (|| -> Result<ImportSourceResult, String> {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO source_files (
                    id, project_id, file_name, file_type, local_path, file_hash, status, metadata_json, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    source_file_id,
                    project_id,
                    file_name,
                    file_type,
                    copied_source_path.display().to_string(),
                    source_hash,
                    status,
                    serde_json::json!({ "error": error }).to_string(),
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        let chunks = insert_source_chunks(
            &transaction,
            &chunks_dir,
            project_id,
            &source_file_id,
            &draft,
            &now,
        )?;

        transaction.commit().map_err(|error| error.to_string())?;

        Ok(ImportSourceResult {
            source_file_id,
            file_name: draft.file_name,
            file_type: draft.file_type,
            status: draft.status,
            error: draft.error,
            chunk_count: chunks.len(),
            chunks,
        })
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&chunks_dir);
        let _ = fs::remove_dir_all(&copied_file_dir);
    }

    result
}

fn ai_runs_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("ai-runs")
}

fn ai_schema_poc_success(
    saved_run: (String, String, String),
    response_summary: String,
) -> AiSchemaPocResult {
    AiSchemaPocResult {
        ok: true,
        ai_run_id: Some(saved_run.0),
        schema_name: AI_SCHEMA_NAME.to_string(),
        schema_version: SCHEMA_VERSION.to_string(),
        response_summary: Some(response_summary),
        request_summary_path: Some(saved_run.1),
        response_json_path: Some(saved_run.2),
        errors: Vec::new(),
    }
}

fn ai_schema_poc_failure(errors: Vec<String>) -> AiSchemaPocResult {
    AiSchemaPocResult {
        ok: false,
        ai_run_id: None,
        schema_name: AI_SCHEMA_NAME.to_string(),
        schema_version: SCHEMA_VERSION.to_string(),
        response_summary: None,
        request_summary_path: None,
        response_json_path: None,
        errors,
    }
}

fn save_ai_run(
    db_path: &PathBuf,
    app_data_dir: &Path,
    project_id: &str,
    codex_thread_id: Option<&str>,
    prompt: &str,
    response_json: &serde_json::Value,
) -> Result<(String, String, String), String> {
    save_ai_run_with_model(
        db_path,
        app_data_dir,
        project_id,
        codex_thread_id,
        prompt,
        response_json,
        AI_RUN_MODEL,
    )
}

fn save_ai_run_with_model(
    db_path: &PathBuf,
    app_data_dir: &Path,
    project_id: &str,
    codex_thread_id: Option<&str>,
    prompt: &str,
    response_json: &serde_json::Value,
    model: &str,
) -> Result<(String, String, String), String> {
    let connection = open_connection(db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;
    let run_dir = ai_runs_dir(app_data_dir, project_id).join(&id);
    let request_summary_path = run_dir.join("request-summary.json");
    let response_json_path = run_dir.join("response.json");
    let input_hash = hash_text(prompt);

    let write_result = (|| -> Result<(), String> {
        fs::create_dir_all(&run_dir).map_err(|error| error.to_string())?;
        fs::write(
            &request_summary_path,
            serde_json::to_vec_pretty(&serde_json::json!({
                "summary": AI_REQUEST_SUMMARY,
                "inputHash": input_hash,
                "schemaName": AI_SCHEMA_NAME,
                "schemaVersion": SCHEMA_VERSION,
            }))
            .map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        fs::write(
            &response_json_path,
            serde_json::to_vec_pretty(response_json).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_dir_all(&run_dir);
        return Err(error);
    }

    let insert_result = connection
        .execute(
            "INSERT INTO ai_runs (
                id, project_id, codex_thread_id, run_type, schema_name, schema_version,
                input_hash, model, status, started_at, completed_at, request_summary_path,
                response_json_path, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                id,
                project_id,
                codex_thread_id,
                AI_RUN_TYPE,
                AI_SCHEMA_NAME,
                SCHEMA_VERSION,
                input_hash,
                model,
                "completed",
                now,
                now,
                request_summary_path.display().to_string(),
                response_json_path.display().to_string(),
                now
            ],
        )
        .map_err(|error| error.to_string());

    if let Err(error) = insert_result {
        let _ = fs::remove_dir_all(&run_dir);
        return Err(error);
    }

    Ok((
        id,
        request_summary_path.display().to_string(),
        response_json_path.display().to_string(),
    ))
}

fn insert_source_chunks(
    transaction: &rusqlite::Transaction<'_>,
    chunks_dir: &Path,
    project_id: &str,
    source_file_id: &str,
    draft: &ReadSourceDraft,
    now: &str,
) -> Result<Vec<SourceChunk>, String> {
    let mut chunks = Vec::new();

    for chunk in &draft.chunks {
        let id = Uuid::new_v4().to_string();
        let content_path = chunks_dir.join(format!("{:04}.txt", chunk.chunk_index));

        fs::write(&content_path, &chunk.content).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO source_chunks (
                    id, project_id, source_file_id, chunk_index, content_path, content_hash,
                    page_number, sheet_name, row_start, row_end, column_start, column_end,
                    heading_path, metadata_json, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                params![
                    id,
                    project_id,
                    source_file_id,
                    chunk.chunk_index as i64,
                    content_path.display().to_string(),
                    chunk.content_hash,
                    chunk.page_number,
                    chunk.sheet_name,
                    chunk.row_start,
                    chunk.row_end,
                    chunk.column_start,
                    chunk.column_end,
                    chunk.heading_path,
                    "{}",
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        chunks.push(SourceChunk {
            id,
            project_id: project_id.to_string(),
            source_file_id: source_file_id.to_string(),
            chunk_index: chunk.chunk_index as i64,
            content_path: String::new(),
            content_hash: chunk.content_hash.clone(),
            page_number: chunk.page_number,
            sheet_name: chunk.sheet_name.clone(),
            row_start: chunk.row_start,
            row_end: chunk.row_end,
            column_start: chunk.column_start,
            column_end: chunk.column_end,
            heading_path: chunk.heading_path.clone(),
            metadata_json: "{}".to_string(),
            created_at: now.to_string(),
        });
    }

    Ok(chunks)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                let drop_state = window.state::<DropImportState>();
                register_dropped_paths(&drop_state, paths);
            }
        })
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            env_config::load_local_env_files(&app_data_dir);
            let db_path = app_data_dir.join("synergy-map.db");

            init_database(&db_path).map_err(Box::<dyn std::error::Error>::from)?;
            app.manage(DbState { db_path });
            app.manage(DropImportState::default());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            list_projects,
            get_storage_info,
            import_sample_source,
            import_source_files,
            import_source_files_from_dialog,
            list_source_chunks,
            run_codex_smoke_test,
            run_codex_device_code_check,
            get_codex_runtime_info,
            get_ai_settings,
            save_ai_settings_command,
            select_default_export_dir,
            open_export_path,
            get_cursor_sdk_status,
            run_cursor_sdk_smoke_test,
            open_external_url,
            run_ai_schema_poc,
            mvp1::get_project_workspace,
            mvp1::update_project,
            mvp1::delete_project,
            mvp1::set_project_center_node,
            mvp1::run_extract_items,
            mvp1::create_onboarding_brief_source,
            mvp1::create_text_information_source,
            mvp1::delete_source_file,
            mvp1::create_extracted_item,
            mvp1::update_extracted_item,
            mvp1::generate_map_from_items,
            mvp1::update_map_node,
            mvp1::update_map_edge,
            mvp1::create_map_edge,
            mvp1::save_map_layout,
            mvp1::save_view_layout,
            mvp1::generate_suggestions_from_map,
            mvp1::generate_ai_lens_from_map,
            mvp1::ask_map_insight,
            mvp1::ask_ai_lens_insight,
            mvp1::update_suggestion,
            mvp1::create_action_item,
            mvp1::create_action_item_from_suggestion,
            mvp1::update_action_item,
            mvp1::create_map_note,
            mvp1::update_map_note,
            mvp1::delete_map_note,
            mvp1::create_named_version,
            mvp1::export_markdown,
            mvp1::export_csv_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_safe_to_run_more_than_once() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));

        init_database(&db_path).expect("initial migration should run");
        init_database(&db_path).expect("second migration run should be safe");

        let connection = open_connection(&db_path).expect("connection should open");
        let migration_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .expect("migration count should be readable");

        assert_eq!(migration_count, MIGRATIONS.len() as i64);

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn phase1_daily_use_migration_applies_to_existing_database() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        let mut connection = open_connection(&db_path).expect("connection should open");
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS _migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    checksum TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                );",
            )
            .expect("migrations table should create");

        for migration in MIGRATIONS.iter().take(3) {
            connection
                .execute_batch(migration.sql)
                .expect("legacy migration should apply");
            connection
                .execute(
                    "INSERT INTO _migrations (version, name, checksum, applied_at)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![
                        migration.version,
                        migration.name,
                        migration_checksum(migration),
                        now_rfc3339().expect("time should format")
                    ],
                )
                .expect("legacy migration record should insert");
        }

        run_migrations(&mut connection).expect("phase1 migration should apply");

        let action_item_table: String = connection
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'action_items'",
                [],
                |row| row.get(0),
            )
            .expect("action_items table should exist");
        let version_name_column: String = connection
            .query_row(
                "SELECT name FROM pragma_table_info('versions') WHERE name = 'name'",
                [],
                |row| row.get(0),
            )
            .expect("versions.name column should exist");
        let migration_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .expect("migration count should load");

        assert_eq!(action_item_table, "action_items");
        assert_eq!(version_name_column, "name");
        assert_eq!(migration_count, MIGRATIONS.len() as i64);

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn migration_checksum_is_derived_from_sql() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));

        init_database(&db_path).expect("database should initialize");

        let connection = open_connection(&db_path).expect("connection should open");
        let checksum: String = connection
            .query_row(
                "SELECT checksum FROM _migrations WHERE version = 1",
                [],
                |row| row.get(0),
            )
            .expect("migration checksum should be readable");

        assert_eq!(checksum, migration_checksum(&MIGRATIONS[0]));
        assert_ne!(checksum, LEGACY_INITIAL_MIGRATION_CHECKSUM);

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn legacy_initial_migration_checksum_is_upgraded() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));

        init_database(&db_path).expect("database should initialize");
        let connection = open_connection(&db_path).expect("connection should open");
        connection
            .execute(
                "UPDATE _migrations SET checksum = ?1 WHERE version = 1",
                [LEGACY_INITIAL_MIGRATION_CHECKSUM],
            )
            .expect("legacy checksum should update");
        drop(connection);

        init_database(&db_path).expect("legacy checksum should upgrade");

        let connection = open_connection(&db_path).expect("connection should reopen");
        let checksum: String = connection
            .query_row(
                "SELECT checksum FROM _migrations WHERE version = 1",
                [],
                |row| row.get(0),
            )
            .expect("migration checksum should be readable");

        assert_eq!(checksum, migration_checksum(&MIGRATIONS[0]));

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn projects_persist_after_reopening_database() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));

        init_database(&db_path).expect("database should initialize");

        {
            let connection = open_connection(&db_path).expect("connection should open");
            let id = Uuid::new_v4().to_string();
            let now = now_rfc3339().expect("timestamp should format");

            connection
                .execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, "Persisted project", now, now],
                )
                .expect("project should insert");
        }

        let connection = open_connection(&db_path).expect("connection should reopen");
        let project_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("project count should be readable");

        assert_eq!(project_count, 1);

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn project_creation_trims_name_and_rejects_empty_names() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        init_database(&db_path).expect("database should initialize");

        let create_with_name = |name: &str| -> Result<Project, String> {
            let trimmed_name = name.trim();

            if trimmed_name.is_empty() {
                return Err("Project name is required.".to_string());
            }

            let connection = open_connection(&db_path)?;
            let id = Uuid::new_v4().to_string();
            let now = now_rfc3339()?;

            connection
                .execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, trimmed_name, now, now],
                )
                .map_err(|error| error.to_string())?;

            get_project_by_id(&connection, &id)
        };

        let project = create_with_name("  Trimmed project  ").expect("project should create");
        let empty_result = create_with_name("   ");

        assert_eq!(project.name, "Trimmed project");
        assert!(empty_result.is_err());

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn list_query_excludes_archived_projects() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        init_database(&db_path).expect("database should initialize");

        let connection = open_connection(&db_path).expect("connection should open");
        let now = now_rfc3339().expect("timestamp should format");

        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at, archived_at)
                 VALUES (?1, ?2, ?3, ?4, NULL), (?5, ?6, ?7, ?8, ?9)",
                params![
                    Uuid::new_v4().to_string(),
                    "Active project",
                    now,
                    now,
                    Uuid::new_v4().to_string(),
                    "Archived project",
                    now,
                    now,
                    now
                ],
            )
            .expect("projects should insert");

        let mut statement = connection
            .prepare(
                "SELECT id, name, client_name, industry, description, memo, created_at, updated_at, archived_at
                 FROM projects
                 WHERE archived_at IS NULL
                 ORDER BY updated_at DESC",
            )
            .expect("statement should prepare");
        let projects = statement
            .query_map([], row_to_project)
            .expect("query should run")
            .collect::<Result<Vec<_>, _>>()
            .expect("rows should map");

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "Active project");

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn migration_drift_is_rejected() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        init_database(&db_path).expect("database should initialize");

        let connection = open_connection(&db_path).expect("connection should open");
        connection
            .execute(
                "UPDATE _migrations SET checksum = 'changed' WHERE version = 1",
                [],
            )
            .expect("migration checksum should update");
        drop(connection);

        let result = init_database(&db_path);

        assert!(result.is_err());

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn save_ai_run_records_paths_without_full_prompt() {
        let test_id = Uuid::new_v4().to_string();
        let app_data_dir = std::env::temp_dir().join(format!("synergy-map-appdata-{test_id}"));
        let db_path = app_data_dir.join("synergy-map.db");
        let project_id = Uuid::new_v4().to_string();
        let now = now_rfc3339().expect("timestamp should format");

        init_database(&db_path).expect("database should initialize");
        let connection = open_connection(&db_path).expect("connection should open");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![project_id, "AI run project", now, now],
            )
            .expect("project should insert");
        drop(connection);

        let prompt = "client secret raw prompt body that must not be stored verbatim";
        let response_json = serde_json::json!({
            "schemaVersion": SCHEMA_VERSION,
            "summary": "ECと店舗接点の連携余地がある。",
            "strongFlows": ["ECから継続購入"],
            "bottlenecks": ["初回商談後の接点"],
            "unconnectedSynergies": ["顧客台帳とEC"],
            "questions": ["継続率を確認できますか？"],
            "opportunities": [{
                "title": "会員連携",
                "rationale": "店舗とECの購買履歴を統合できる。",
                "expectedImpact": "再購入率向上"
            }],
            "risks": ["実データ確認が必要"]
        });

        let (ai_run_id, request_summary_path, response_json_path) = save_ai_run(
            &db_path,
            &app_data_dir,
            &project_id,
            Some("thread-1"),
            prompt,
            &response_json,
        )
        .expect("ai run should save");

        let request_summary =
            fs::read_to_string(&request_summary_path).expect("request summary should exist");
        let response_body =
            fs::read_to_string(&response_json_path).expect("response json should exist");

        assert!(!request_summary.contains(prompt));
        assert!(request_summary.contains("inputHash"));
        assert!(response_body.contains("schemaVersion"));

        let connection = open_connection(&db_path).expect("connection should reopen");
        let saved: (String, String, String, String, String) = connection
            .query_row(
                "SELECT id, status, schema_name, schema_version, codex_thread_id FROM ai_runs WHERE id = ?1",
                [ai_run_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .expect("ai run row should exist");

        assert_eq!(saved.1, "completed");
        assert_eq!(saved.2, "AiAnalysisOutput");
        assert_eq!(saved.3, SCHEMA_VERSION);
        assert_eq!(saved.4, "thread-1");

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn invalid_schema_output_is_rejected_before_save() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        init_database(&db_path).expect("database should initialize");

        let invalid_response = serde_json::json!({
            "schemaVersion": "phase0.old",
            "summary": "summary",
            "strongFlows": [],
            "bottlenecks": [],
            "unconnectedSynergies": [],
            "questions": [],
            "opportunities": [{
                "title": "title",
                "rationale": "why",
                "expectedImpact": "impact"
            }],
            "risks": []
        });

        let result = validate_ai_analysis_json(&invalid_response);
        assert!(result.is_err());

        let connection = open_connection(&db_path).expect("connection should reopen");
        let ai_run_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM ai_runs", [], |row| row.get(0))
            .expect("ai run count should be readable");
        assert_eq!(ai_run_count, 0);

        let _ = fs::remove_file(db_path);
    }
}
