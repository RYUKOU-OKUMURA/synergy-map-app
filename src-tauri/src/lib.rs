use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{Manager, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

mod ai_schema;
mod codex_app_server;
mod source_reader;

use ai_schema::{ai_analysis_json_schema, validate_ai_analysis_json, SCHEMA_VERSION};
use codex_app_server::{CodexRuntimeInfo, CodexSmokeResult, DeviceCodeLoginResult};
use source_reader::{read_source_file, ReadSourceDraft};

struct DbState {
    db_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    client_name: Option<String>,
    industry: Option<String>,
    description: Option<String>,
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
    checksum: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "initial",
    checksum: "0001_initial_v1",
    sql: include_str!("../migrations/0001_initial.sql"),
}];

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

fn now_rfc3339() -> Result<String, String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| error.to_string())
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
        let applied_migration = transaction
            .query_row(
                "SELECT name, checksum FROM _migrations WHERE version = ?1",
                [migration.version],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        if let Some((name, checksum)) = applied_migration {
            if name != migration.name || checksum != migration.checksum {
                return Err(format!(
                    "Migration drift detected for version {}.",
                    migration.version
                ));
            }

            continue;
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
                    migration.checksum,
                    now_rfc3339()?
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())
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
                params![migration.checksum, migration.version, migration.name],
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
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

fn get_project_by_id(connection: &Connection, id: &str) -> Result<Project, String> {
    connection
        .query_row(
            "SELECT id, name, client_name, industry, description, created_at, updated_at, archived_at
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

fn source_chunk_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceChunk> {
    Ok(SourceChunk {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        source_file_id: row.get("source_file_id")?,
        chunk_index: row.get("chunk_index")?,
        content_path: row.get("content_path")?,
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
fn create_project(state: State<'_, DbState>, name: String) -> Result<Project, String> {
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        return Err("Project name is required.".to_string());
    }

    let connection = open_connection(&state.db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;

    connection
        .execute(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, trimmed_name, now, now],
        )
        .map_err(|error| error.to_string())?;

    get_project_by_id(&connection, &id)
}

#[tauri::command]
fn list_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let connection = open_connection(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, name, client_name, industry, description, created_at, updated_at, archived_at
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
    let app_data_dir = state
        .db_path
        .parent()
        .ok_or_else(|| "DB path has no parent directory.".to_string())?;

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
    let app_data_dir = state
        .db_path
        .parent()
        .ok_or_else(|| "DB path has no parent directory.".to_string())?;
    let sample_file_name = PHASE0_SAMPLE_FILES
        .iter()
        .find(|allowed_name| **allowed_name == sample_file_name)
        .ok_or_else(|| "Sample file is not allowed.".to_string())?;
    let sample_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("samples")
        .join("phase-0")
        .join(sample_file_name);

    import_source_path(&state.db_path, app_data_dir, &project_id, &sample_path)
}

#[tauri::command]
fn list_source_chunks(
    state: State<'_, DbState>,
    source_file_id: String,
) -> Result<Vec<SourceChunk>, String> {
    let connection = open_connection(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, source_file_id, chunk_index, content_path, content_hash,
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
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")));

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
fn run_ai_schema_poc(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    project_id: String,
) -> Result<AiSchemaPocResult, String> {
    let app_data_dir = state
        .db_path
        .parent()
        .ok_or_else(|| "DB path has no parent directory.".to_string())?;
    let connection = open_connection(&state.db_path)?;
    let project = get_project_by_id(&connection, &project_id)?;
    let prompt = format!(
        "Sample FoodsのPhase 0検証です。既存顧客、店舗接点、EC接点、商品連携、売上効果の関係から、事業機会を日本語で短く分析してください。schemaVersionは必ず{}にしてください。",
        SCHEMA_VERSION
    );
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    let structured = codex_app_server::run_structured_output_turn(
        app,
        &cwd.display().to_string(),
        &prompt,
        ai_analysis_json_schema(),
    );

    if let Some(response_json) = structured.response_json.as_ref() {
        match validate_ai_analysis_json(response_json) {
            Ok(output) => {
                let ai_run_id = save_ai_run(
                    &state.db_path,
                    app_data_dir,
                    &project.id,
                    structured.thread_id.as_deref(),
                    &prompt,
                    response_json,
                )?;

                Ok(AiSchemaPocResult {
                    ok: true,
                    ai_run_id: Some(ai_run_id.0),
                    schema_name: "AiAnalysisOutput".to_string(),
                    schema_version: SCHEMA_VERSION.to_string(),
                    response_summary: Some(output.summary),
                    request_summary_path: Some(ai_run_id.1),
                    response_json_path: Some(ai_run_id.2),
                    errors: Vec::new(),
                })
            }
            Err(error) => Ok(AiSchemaPocResult {
                ok: false,
                ai_run_id: None,
                schema_name: "AiAnalysisOutput".to_string(),
                schema_version: SCHEMA_VERSION.to_string(),
                response_summary: None,
                request_summary_path: None,
                response_json_path: None,
                errors: vec![error],
            }),
        }
    } else {
        Ok(AiSchemaPocResult {
            ok: false,
            ai_run_id: None,
            schema_name: "AiAnalysisOutput".to_string(),
            schema_version: SCHEMA_VERSION.to_string(),
            response_summary: None,
            request_summary_path: None,
            response_json_path: None,
            errors: structured.errors,
        })
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

    let draft = read_source_file(source_path);
    let source_file_id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;
    let file_name = draft.file_name.clone();
    let file_type = draft.file_type.clone();
    let status = draft.status.clone();
    let error = draft.error.clone();
    let chunks_dir = source_chunks_dir(app_data_dir, project_id).join(&source_file_id);

    fs::create_dir_all(&chunks_dir).map_err(|error| error.to_string())?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO source_files (
                id, project_id, file_name, file_type, local_path, status, metadata_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                source_file_id,
                project_id,
                file_name,
                file_type,
                source_path.display().to_string(),
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
}

fn ai_runs_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("ai-runs")
}

fn save_ai_run(
    db_path: &PathBuf,
    app_data_dir: &Path,
    project_id: &str,
    codex_thread_id: Option<&str>,
    prompt: &str,
    response_json: &serde_json::Value,
) -> Result<(String, String, String), String> {
    let connection = open_connection(db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;
    let run_dir = ai_runs_dir(app_data_dir, project_id).join(&id);
    let request_summary_path = run_dir.join("request-summary.json");
    let response_json_path = run_dir.join("response.json");
    let input_hash = hex::encode(Sha256::digest(prompt.as_bytes()));

    fs::create_dir_all(&run_dir).map_err(|error| error.to_string())?;
    fs::write(
        &request_summary_path,
        serde_json::to_vec_pretty(&serde_json::json!({
            "summary": "Phase 0 sample map analysis request. Full source chunks are not included.",
            "inputHash": input_hash,
            "schemaName": "AiAnalysisOutput",
            "schemaVersion": SCHEMA_VERSION,
        }))
        .map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::write(
        &response_json_path,
        serde_json::to_vec_pretty(response_json).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    connection
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
                "phase0_schema_poc",
                "AiAnalysisOutput",
                SCHEMA_VERSION,
                input_hash,
                "codex-app-server",
                "completed",
                now,
                now,
                request_summary_path.display().to_string(),
                response_json_path.display().to_string(),
                now
            ],
        )
        .map_err(|error| error.to_string())?;

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
            content_path: content_path.display().to_string(),
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

        assert_eq!(migration_count, 1);

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
                "SELECT id, name, client_name, industry, description, created_at, updated_at, archived_at
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let db_path = app_data_dir.join("synergy-map.db");

            init_database(&db_path).map_err(Box::<dyn std::error::Error>::from)?;
            app.manage(DbState { db_path });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            list_projects,
            get_storage_info,
            import_sample_source,
            list_source_chunks,
            run_codex_smoke_test,
            run_codex_device_code_check,
            get_codex_runtime_info,
            run_ai_schema_poc
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
