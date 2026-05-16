use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use csv::Terminator;
use rusqlite::{params, types::ValueRef, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::ai_schema::{
    ai_analysis_json_schema, extracted_items_json_schema, map_draft_json_schema,
    suggestion_cards_json_schema, validate_ai_analysis_json, validate_extracted_items_json,
    validate_map_draft_json, validate_suggestion_cards_json, SCHEMA_VERSION,
};
use crate::codex_app_server;
use crate::DbState;

const LOCAL_MODEL: &str = "mvp-local-draft";
const CODEX_MODEL: &str = "codex-app-server";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFileRow {
    id: String,
    project_id: String,
    file_name: String,
    file_type: String,
    local_path: String,
    file_hash: Option<String>,
    status: String,
    metadata_json: String,
    chunk_count: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceChunkRow {
    id: String,
    project_id: String,
    source_file_id: String,
    file_name: String,
    chunk_index: i64,
    content_path: String,
    content_preview: String,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSourceRow {
    id: String,
    extracted_item_id: String,
    source_file_id: Option<String>,
    source_chunk_id: Option<String>,
    source_file_name: Option<String>,
    quote: Option<String>,
    page_number: Option<i64>,
    sheet_name: Option<String>,
    row_start: Option<i64>,
    row_end: Option<i64>,
    heading_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItemRow {
    id: String,
    project_id: String,
    ai_run_id: Option<String>,
    name: String,
    item_type: String,
    description: Option<String>,
    confidence_status: String,
    impact_score: i64,
    subjective_importance: i64,
    adoption_status: String,
    memo: Option<String>,
    sources: Vec<ItemSourceRow>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapNodeRow {
    id: String,
    project_id: String,
    extracted_item_id: Option<String>,
    node_type: String,
    label: String,
    description: Option<String>,
    influence_level: Option<String>,
    information_richness: Option<String>,
    confidence_status: Option<String>,
    badges_json: String,
    position_json: String,
    adoption_status: String,
    memo: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEdgeRow {
    id: String,
    project_id: String,
    source_node_id: String,
    target_node_id: String,
    edge_type: String,
    flow_type: Option<String>,
    strength: Option<String>,
    direction: Option<String>,
    confidence_status: Option<String>,
    evidence: Option<String>,
    note: Option<String>,
    label: Option<String>,
    adoption_status: String,
    priority: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionRow {
    id: String,
    project_id: String,
    ai_run_id: Option<String>,
    title: String,
    description: String,
    priority: String,
    adoption_status: String,
    rationale: Option<String>,
    related_node_ids_json: String,
    memo: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCommentRow {
    id: String,
    project_id: String,
    ai_run_id: Option<String>,
    comment_type: String,
    title: String,
    body: String,
    confidence_status: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunRow {
    id: String,
    project_id: String,
    codex_thread_id: Option<String>,
    run_type: String,
    schema_name: Option<String>,
    schema_version: Option<String>,
    model: Option<String>,
    status: String,
    started_at: Option<String>,
    completed_at: Option<String>,
    error: Option<String>,
    request_summary_path: Option<String>,
    response_json_path: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobRow {
    id: String,
    project_id: String,
    export_type: String,
    status: String,
    output_path: Option<String>,
    error: Option<String>,
    created_at: String,
    completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionRow {
    id: String,
    project_id: String,
    version_type: String,
    snapshot_json: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspace {
    source_files: Vec<SourceFileRow>,
    source_chunks: Vec<SourceChunkRow>,
    extracted_items: Vec<ExtractedItemRow>,
    nodes: Vec<MapNodeRow>,
    edges: Vec<MapEdgeRow>,
    suggestions: Vec<SuggestionRow>,
    ai_comments: Vec<AiCommentRow>,
    ai_runs: Vec<AiRunRow>,
    export_jobs: Vec<ExportJobRow>,
    versions: Vec<VersionRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MvpRunResult {
    ok: bool,
    ai_run_id: Option<String>,
    message: String,
    workspace: ProjectWorkspace,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    ok: bool,
    export_job: ExportJobRow,
    workspace: ProjectWorkspace,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapPositionInput {
    node_id: String,
    x: f64,
    y: f64,
}

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

fn app_data_dir_from_db(db_path: &Path) -> Result<&Path, String> {
    db_path
        .parent()
        .ok_or_else(|| "DB path has no parent directory.".to_string())
}

fn project_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    app_data_dir.join("projects").join(project_id)
}

fn ai_runs_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("ai-runs")
}

fn exports_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("exports")
}

fn hash_text(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn workspace_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn try_structured_codex(app: AppHandle, prompt: &str, schema: Value) -> Result<Value, String> {
    let cwd = workspace_dir();
    let result = codex_app_server::run_structured_output_turn(
        app,
        &cwd.display().to_string(),
        prompt,
        schema,
    );

    if result.ok {
        result
            .response_json
            .ok_or_else(|| "Codex structured output was empty.".to_string())
    } else {
        Err(if result.errors.is_empty() {
            "Codex structured output failed.".to_string()
        } else {
            result.errors.join("; ")
        })
    }
}

fn read_text_preview(path: &str, limit: usize) -> String {
    fs::read_to_string(path)
        .map(|content| truncate_chars(&content.replace('\n', " "), limit))
        .unwrap_or_default()
}

fn truncate_chars(value: &str, limit: usize) -> String {
    let trimmed = value.trim();
    let mut result = String::new();

    for character in trimmed.chars().take(limit) {
        result.push(character);
    }

    if trimmed.chars().count() > limit {
        result.push('…');
    }

    result
}

fn ensure_project_exists(connection: &Connection, project_id: &str) -> Result<(), String> {
    let exists: Option<String> = connection
        .query_row(
            "SELECT id FROM projects WHERE id = ?1 AND archived_at IS NULL",
            [project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if exists.is_some() {
        Ok(())
    } else {
        Err("Project was not found.".to_string())
    }
}

#[tauri::command]
pub fn get_project_workspace(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<ProjectWorkspace, String> {
    let connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn update_project(
    state: State<'_, DbState>,
    project_id: String,
    name: String,
    client_name: Option<String>,
    industry: Option<String>,
    description: Option<String>,
    memo: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let connection = open_connection(&state.db_path)?;
    let now = now_rfc3339()?;
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        return Err("Project name is required.".to_string());
    }

    connection
        .execute(
            "UPDATE projects
             SET name = ?1, client_name = ?2, industry = ?3, description = ?4, memo = ?5, updated_at = ?6
             WHERE id = ?7 AND archived_at IS NULL",
            params![
                trimmed_name,
                empty_to_none(client_name),
                empty_to_none(industry),
                empty_to_none(description),
                empty_to_none(memo),
                now,
                project_id
            ],
        )
        .map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn delete_project(state: State<'_, DbState>, project_id: String) -> Result<(), String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let directory = project_dir(&app_data_dir, &project_id);

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM projects WHERE id = ?1", [project_id.as_str()])
        .map_err(|error| error.to_string())?;

    if directory.exists() {
        fs::remove_dir_all(directory).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn run_extract_items(
    app: AppHandle,
    state: State<'_, DbState>,
    project_id: String,
    source_chunk_ids: Option<Vec<String>>,
) -> Result<MvpRunResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let chunks = load_chunks_for_extraction(&connection, &project_id, source_chunk_ids)?;

    if chunks.is_empty() {
        return Err(
            "読み取り済みsource chunksがありません。先に資料を投入してください。".to_string(),
        );
    }

    let prompt = extraction_prompt(&chunks);
    let prompt_hash = hash_text(&prompt);
    let codex_result = try_structured_codex(app, &prompt, extracted_items_json_schema());
    let (output_json, model, status, error, fallback_used, message) = match codex_result {
        Ok(value) => (
            value,
            CODEX_MODEL,
            "completed",
            None,
            false,
            "抽出カードを生成しました。".to_string(),
        ),
        Err(error) => (
            build_extracted_items_output(&chunks),
            LOCAL_MODEL,
            "fallback_completed",
            Some(error),
            true,
            "Codex AI実行に失敗したため、ローカルドラフトで抽出カードを生成しました。".to_string(),
        ),
    };
    let output = validate_extracted_items_json(&output_json)?;
    validate_extracted_item_source_refs(&connection, &project_id, &output)?;
    let ai_run_id = save_ai_run(
        &connection,
        &app_data_dir,
        &project_id,
        "extract_items",
        "ExtractedItemsOutput",
        model,
        pending_ai_run_status(status),
        json!({
            "mode": "local_summary_only",
            "fallbackUsed": fallback_used,
            "promptHash": prompt_hash.clone(),
            "sourceChunkCount": chunks.len(),
            "sourceChunkIds": chunks.iter().map(|chunk| chunk.id.clone()).collect::<Vec<_>>(),
        }),
        &output_json,
        error,
    )?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for table_name in ["suggestions", "ai_comments", "edges", "nodes"] {
        transaction
            .execute(
                &format!("DELETE FROM {table_name} WHERE project_id = ?1"),
                [project_id.as_str()],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "DELETE FROM extracted_items WHERE project_id = ?1",
            [project_id.as_str()],
        )
        .map_err(|error| error.to_string())?;
    insert_extracted_items(&transaction, &project_id, &ai_run_id, &output)?;
    finalize_ai_run_in_transaction(&transaction, &ai_run_id, status)?;
    record_snapshot_in_transaction(&transaction, &project_id, "ai_extract_items")?;
    transaction.commit().map_err(|error| error.to_string())?;

    Ok(MvpRunResult {
        ok: true,
        ai_run_id: Some(ai_run_id),
        message,
        workspace: load_workspace(&connection, &project_id)?,
    })
}

#[tauri::command]
pub fn create_extracted_item(
    state: State<'_, DbState>,
    project_id: String,
    name: String,
    item_type: String,
    description: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "INSERT INTO extracted_items (
                id, project_id, name, item_type, description, confidence_status,
                impact_score, subjective_importance, adoption_status, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'confirmed', 2, 2, 'accepted', ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                project_id,
                name,
                item_type,
                empty_to_none(description),
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_items")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_extracted_item(
    state: State<'_, DbState>,
    project_id: String,
    item_id: String,
    name: String,
    item_type: String,
    description: Option<String>,
    confidence_status: String,
    impact_score: i64,
    subjective_importance: i64,
    adoption_status: String,
    memo: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "UPDATE extracted_items
             SET name = ?1, item_type = ?2, description = ?3, confidence_status = ?4,
                 impact_score = ?5, subjective_importance = ?6, adoption_status = ?7,
                 memo = ?8, updated_at = ?9
             WHERE id = ?10 AND project_id = ?11",
            params![
                name,
                item_type,
                empty_to_none(description),
                confidence_status,
                impact_score,
                subjective_importance,
                adoption_status,
                empty_to_none(memo),
                now,
                item_id,
                project_id
            ],
        )
        .map_err(|error| error.to_string())?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_items")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn generate_map_from_items(
    app: AppHandle,
    state: State<'_, DbState>,
    project_id: String,
) -> Result<MvpRunResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let items = load_items_for_map(&connection, &project_id)?;

    if items.is_empty() {
        return Err(
            "採用中の抽出カードがありません。先にAI抽出カードを生成・確認してください。"
                .to_string(),
        );
    }

    let prompt = map_prompt(&items);
    let prompt_hash = hash_text(&prompt);
    let codex_result = try_structured_codex(app, &prompt, map_draft_json_schema());
    let (output_json, model, status, error, fallback_used, message) = match codex_result {
        Ok(value) => (
            value,
            CODEX_MODEL,
            "completed",
            None,
            false,
            "シナジーマップを生成しました。".to_string(),
        ),
        Err(error) => (
            build_map_output(&items),
            LOCAL_MODEL,
            "fallback_completed",
            Some(error),
            true,
            "Codex AI実行に失敗したため、ローカルドラフトでシナジーマップを生成しました。"
                .to_string(),
        ),
    };
    let output = validate_map_draft_json(&output_json)?;
    let ai_run_id = save_ai_run(
        &connection,
        &app_data_dir,
        &project_id,
        "generate_map",
        "MapDraftOutput",
        model,
        pending_ai_run_status(status),
        json!({
            "mode": "accepted_extracted_items",
            "fallbackUsed": fallback_used,
            "promptHash": prompt_hash,
            "extractedItemCount": items.len(),
            "extractedItemIds": items.iter().map(|item| item.id.clone()).collect::<Vec<_>>(),
        }),
        &output_json,
        error,
    )?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM edges WHERE project_id = ?1",
            [project_id.as_str()],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM nodes WHERE project_id = ?1",
            [project_id.as_str()],
        )
        .map_err(|error| error.to_string())?;
    insert_map(&transaction, &project_id, &output)?;
    finalize_ai_run_in_transaction(&transaction, &ai_run_id, status)?;
    record_snapshot_in_transaction(&transaction, &project_id, "ai_generate_map")?;
    transaction.commit().map_err(|error| error.to_string())?;

    Ok(MvpRunResult {
        ok: true,
        ai_run_id: Some(ai_run_id),
        message,
        workspace: load_workspace(&connection, &project_id)?,
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_map_node(
    state: State<'_, DbState>,
    project_id: String,
    node_id: String,
    label: String,
    node_type: String,
    description: Option<String>,
    confidence_status: String,
    influence_level: Option<String>,
    information_richness: Option<String>,
    adoption_status: String,
    memo: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "UPDATE nodes
             SET label = ?1, node_type = ?2, description = ?3, confidence_status = ?4,
                 influence_level = ?5, information_richness = ?6, adoption_status = ?7,
                 memo = ?8, updated_at = ?9
             WHERE id = ?10 AND project_id = ?11",
            params![
                label,
                node_type,
                empty_to_none(description),
                confidence_status,
                empty_to_none(influence_level),
                empty_to_none(information_richness),
                adoption_status,
                empty_to_none(memo),
                now,
                node_id,
                project_id
            ],
        )
        .map_err(|error| error.to_string())?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_map")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_map_edge(
    state: State<'_, DbState>,
    project_id: String,
    edge_id: String,
    label: Option<String>,
    flow_type: Option<String>,
    strength: Option<String>,
    confidence_status: Option<String>,
    edge_type: String,
    adoption_status: String,
    note: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "UPDATE edges
             SET label = ?1, flow_type = ?2, strength = ?3, confidence_status = ?4,
                 edge_type = ?5, adoption_status = ?6, note = ?7, updated_at = ?8
             WHERE id = ?9 AND project_id = ?10",
            params![
                empty_to_none(label),
                empty_to_none(flow_type),
                empty_to_none(strength),
                empty_to_none(confidence_status),
                edge_type,
                adoption_status,
                empty_to_none(note),
                now,
                edge_id,
                project_id
            ],
        )
        .map_err(|error| error.to_string())?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_map")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn save_map_layout(
    state: State<'_, DbState>,
    project_id: String,
    positions: Vec<MapPositionInput>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    for position in positions {
        transaction
            .execute(
                "UPDATE nodes SET position_json = ?1, updated_at = ?2 WHERE id = ?3 AND project_id = ?4",
                params![
                    json!({ "x": position.x, "y": position.y }).to_string(),
                    now,
                    position.node_id,
                    project_id
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_map_layout")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn generate_suggestions_from_map(
    app: AppHandle,
    state: State<'_, DbState>,
    project_id: String,
) -> Result<MvpRunResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let workspace = load_workspace(&connection, &project_id)?;

    if workspace.nodes.is_empty() {
        return Err("シナジーマップがありません。先にマップを生成してください。".to_string());
    }

    let prompt = analysis_prompt(&workspace);
    let prompt_hash = hash_text(&prompt);
    let analysis_result = try_structured_codex(app.clone(), &prompt, ai_analysis_json_schema());
    let suggestions_result = try_structured_codex(app, &prompt, suggestion_cards_json_schema());
    let (analysis_json, analysis_model, analysis_status, analysis_error, analysis_fallback_used) =
        match analysis_result {
            Ok(value) => (value, CODEX_MODEL, "completed", None, false),
            Err(error) => (
                build_analysis_output(&workspace),
                LOCAL_MODEL,
                "fallback_completed",
                Some(error),
                true,
            ),
        };
    let (
        suggestions_json,
        suggestions_model,
        suggestions_status,
        suggestions_error,
        suggestions_fallback_used,
    ) = match suggestions_result {
        Ok(value) => (value, CODEX_MODEL, "completed", None, false),
        Err(error) => (
            build_suggestions_output(&workspace),
            LOCAL_MODEL,
            "fallback_completed",
            Some(error),
            true,
        ),
    };
    let analysis = validate_ai_analysis_json(&analysis_json)?;
    let suggestions = validate_suggestion_cards_json(&suggestions_json)?;
    let analysis_run_id = save_ai_run(
        &connection,
        &app_data_dir,
        &project_id,
        "analyze_map",
        "AiAnalysisOutput",
        analysis_model,
        pending_ai_run_status(analysis_status),
        json!({
            "mode": "map_summary",
            "fallbackUsed": analysis_fallback_used,
            "promptHash": prompt_hash.clone(),
            "nodeCount": workspace.nodes.len(),
            "edgeCount": workspace.edges.len(),
        }),
        &analysis_json,
        analysis_error,
    )?;
    let suggestions_run_id = save_ai_run(
        &connection,
        &app_data_dir,
        &project_id,
        "generate_suggestions",
        "SuggestionCardsOutput",
        suggestions_model,
        pending_ai_run_status(suggestions_status),
        json!({
            "mode": "map_summary",
            "fallbackUsed": suggestions_fallback_used,
            "promptHash": prompt_hash,
            "nodeCount": workspace.nodes.len(),
            "edgeCount": workspace.edges.len(),
        }),
        &suggestions_json,
        suggestions_error,
    )?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM suggestions WHERE project_id = ?1",
            [project_id.as_str()],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM ai_comments WHERE project_id = ?1",
            [project_id.as_str()],
        )
        .map_err(|error| error.to_string())?;
    insert_ai_comments(&transaction, &project_id, &analysis_run_id, &analysis)?;
    insert_suggestions(&transaction, &project_id, &suggestions_run_id, &suggestions)?;
    finalize_ai_run_in_transaction(&transaction, &analysis_run_id, analysis_status)?;
    finalize_ai_run_in_transaction(&transaction, &suggestions_run_id, suggestions_status)?;
    record_snapshot_in_transaction(&transaction, &project_id, "ai_generate_suggestions")?;
    transaction.commit().map_err(|error| error.to_string())?;

    let message = if analysis_fallback_used || suggestions_fallback_used {
        "Codex AI実行に失敗した一部出力をローカルドラフトで補完しました。".to_string()
    } else {
        "AIコメントと施策カードを生成しました。".to_string()
    };

    Ok(MvpRunResult {
        ok: true,
        ai_run_id: Some(suggestions_run_id),
        message,
        workspace: load_workspace(&connection, &project_id)?,
    })
}

#[tauri::command]
pub fn export_markdown(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<ExportResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let workspace = load_workspace(&connection, &project_id)?;
    let project_name = project_name(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let dir = exports_dir(&app_data_dir, &project_id);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(format!("synergy-map-{}.md", timestamp_for_file(&now)));
    let markdown = render_markdown(&project_name, &workspace);
    fs::write(&path, markdown).map_err(|error| error.to_string())?;
    let job = insert_export_job(&connection, &project_id, "markdown", &path, &now)?;

    Ok(ExportResult {
        ok: true,
        export_job: job,
        workspace: load_workspace(&connection, &project_id)?,
    })
}

#[tauri::command]
pub fn export_csv_bundle(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<ExportResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let workspace = load_workspace(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let dir =
        exports_dir(&app_data_dir, &project_id).join(format!("csv-{}", timestamp_for_file(&now)));
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    write_nodes_csv(&dir.join("nodes.csv"), &workspace.nodes)?;
    write_edges_csv(&dir.join("edges.csv"), &workspace.edges)?;
    write_suggestions_csv(&dir.join("suggestions.csv"), &workspace.suggestions)?;
    write_sources_csv(&dir.join("sources.csv"), &workspace.source_files)?;
    let job = insert_export_job(&connection, &project_id, "csv", &dir, &now)?;

    Ok(ExportResult {
        ok: true,
        export_job: job,
        workspace: load_workspace(&connection, &project_id)?,
    })
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

fn load_workspace(connection: &Connection, project_id: &str) -> Result<ProjectWorkspace, String> {
    Ok(ProjectWorkspace {
        source_files: load_source_files(connection, project_id)?,
        source_chunks: load_source_chunks(connection, project_id)?,
        extracted_items: load_extracted_items(connection, project_id)?,
        nodes: load_nodes(connection, project_id)?,
        edges: load_edges(connection, project_id)?,
        suggestions: load_suggestions(connection, project_id)?,
        ai_comments: load_ai_comments(connection, project_id)?,
        ai_runs: load_ai_runs(connection, project_id)?,
        export_jobs: load_export_jobs(connection, project_id)?,
        versions: load_versions(connection, project_id)?,
    })
}

fn load_source_files(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<SourceFileRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT sf.id, sf.project_id, sf.file_name, sf.file_type, sf.local_path, sf.file_hash,
                    sf.status, sf.metadata_json, COUNT(sc.id) AS chunk_count, sf.created_at, sf.updated_at
             FROM source_files sf
             LEFT JOIN source_chunks sc ON sc.source_file_id = sf.id
             WHERE sf.project_id = ?1
             GROUP BY sf.id
             ORDER BY sf.created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(SourceFileRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                file_name: row.get(2)?,
                file_type: row.get(3)?,
                local_path: "[app-data]/projects/{project}/sources".to_string(),
                file_hash: row.get(5)?,
                status: row.get(6)?,
                metadata_json: row.get(7)?,
                chunk_count: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_source_chunks(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<SourceChunkRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT sc.id, sc.project_id, sc.source_file_id, sf.file_name, sc.chunk_index,
                    sc.content_path, sc.content_hash, sc.page_number, sc.sheet_name,
                    sc.row_start, sc.row_end, sc.column_start, sc.column_end,
                    sc.heading_path, sc.metadata_json, sc.created_at
             FROM source_chunks sc
             JOIN source_files sf ON sf.id = sc.source_file_id
             WHERE sc.project_id = ?1
             ORDER BY sf.created_at DESC, sc.chunk_index ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            let content_path: String = row.get(5)?;
            Ok(SourceChunkRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_file_id: row.get(2)?,
                file_name: row.get(3)?,
                chunk_index: row.get(4)?,
                content_preview: read_text_preview(&content_path, 120),
                content_path: String::new(),
                content_hash: row.get(6)?,
                page_number: row.get(7)?,
                sheet_name: row.get(8)?,
                row_start: row.get(9)?,
                row_end: row.get(10)?,
                column_start: row.get(11)?,
                column_end: row.get(12)?,
                heading_path: row.get(13)?,
                metadata_json: row.get(14)?,
                created_at: row.get(15)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_extracted_items(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ExtractedItemRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, ai_run_id, name, item_type, description,
                    confidence_status, impact_score, subjective_importance, adoption_status,
                    memo, created_at, updated_at
             FROM extracted_items
             WHERE project_id = ?1
             ORDER BY
               CASE adoption_status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
               updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(ExtractedItemRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                ai_run_id: row.get(2)?,
                name: row.get(3)?,
                item_type: row.get(4)?,
                description: row.get(5)?,
                confidence_status: row.get(6)?,
                impact_score: row.get(7)?,
                subjective_importance: row.get(8)?,
                adoption_status: row.get(9)?,
                memo: row.get(10)?,
                sources: Vec::new(),
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for item in &mut items {
        item.sources = load_item_sources(connection, &item.id)?;
    }

    Ok(items)
}

fn load_item_sources(
    connection: &Connection,
    extracted_item_id: &str,
) -> Result<Vec<ItemSourceRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT isr.id, isr.extracted_item_id, isr.source_file_id, isr.source_chunk_id,
                    sf.file_name, isr.quote, isr.page_number, isr.sheet_name,
                    isr.row_start, isr.row_end, isr.heading_path
             FROM item_sources isr
             LEFT JOIN source_files sf ON sf.id = isr.source_file_id
             WHERE isr.extracted_item_id = ?1
             ORDER BY isr.created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([extracted_item_id], |row| {
            Ok(ItemSourceRow {
                id: row.get(0)?,
                extracted_item_id: row.get(1)?,
                source_file_id: row.get(2)?,
                source_chunk_id: row.get(3)?,
                source_file_name: row.get(4)?,
                quote: row.get(5)?,
                page_number: row.get(6)?,
                sheet_name: row.get(7)?,
                row_start: row.get(8)?,
                row_end: row.get(9)?,
                heading_path: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_nodes(connection: &Connection, project_id: &str) -> Result<Vec<MapNodeRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, extracted_item_id, node_type, label, description,
                    influence_level, information_richness, confidence_status, badges_json,
                    position_json, adoption_status, memo, created_at, updated_at
             FROM nodes
             WHERE project_id = ?1
             ORDER BY label ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(MapNodeRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                extracted_item_id: row.get(2)?,
                node_type: row.get(3)?,
                label: row.get(4)?,
                description: row.get(5)?,
                influence_level: row.get(6)?,
                information_richness: row.get(7)?,
                confidence_status: row.get(8)?,
                badges_json: row.get(9)?,
                position_json: row.get(10)?,
                adoption_status: row.get(11)?,
                memo: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_edges(connection: &Connection, project_id: &str) -> Result<Vec<MapEdgeRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, source_node_id, target_node_id, edge_type, flow_type,
                    strength, direction, confidence_status, evidence, note, label,
                    adoption_status, priority, created_at, updated_at
             FROM edges
             WHERE project_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(MapEdgeRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_node_id: row.get(2)?,
                target_node_id: row.get(3)?,
                edge_type: row.get(4)?,
                flow_type: row.get(5)?,
                strength: row.get(6)?,
                direction: row.get(7)?,
                confidence_status: row.get(8)?,
                evidence: row.get(9)?,
                note: row.get(10)?,
                label: row.get(11)?,
                adoption_status: row.get(12)?,
                priority: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_suggestions(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<SuggestionRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, ai_run_id, title, description, priority,
                    adoption_status, rationale, related_node_ids_json, memo, created_at, updated_at
             FROM suggestions
             WHERE project_id = ?1
             ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(SuggestionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                ai_run_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                priority: row.get(5)?,
                adoption_status: row.get(6)?,
                rationale: row.get(7)?,
                related_node_ids_json: row.get(8)?,
                memo: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_ai_comments(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<AiCommentRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, ai_run_id, comment_type, title, body,
                    confidence_status, created_at
             FROM ai_comments
             WHERE project_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(AiCommentRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                ai_run_id: row.get(2)?,
                comment_type: row.get(3)?,
                title: row.get(4)?,
                body: row.get(5)?,
                confidence_status: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_ai_runs(connection: &Connection, project_id: &str) -> Result<Vec<AiRunRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, codex_thread_id, run_type, schema_name, schema_version,
                    model, status, started_at, completed_at, error, request_summary_path,
                    response_json_path, created_at
             FROM ai_runs
             WHERE project_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(AiRunRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                codex_thread_id: row.get(2)?,
                run_type: row.get(3)?,
                schema_name: row.get(4)?,
                schema_version: row.get(5)?,
                model: row.get(6)?,
                status: row.get(7)?,
                started_at: row.get(8)?,
                completed_at: row.get(9)?,
                error: row.get(10)?,
                request_summary_path: row.get(11)?,
                response_json_path: row.get(12)?,
                created_at: row.get(13)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_export_jobs(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ExportJobRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, export_type, status, output_path, error, created_at, completed_at
             FROM export_jobs
             WHERE project_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(ExportJobRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                export_type: row.get(2)?,
                status: row.get(3)?,
                output_path: row.get(4)?,
                error: row.get(5)?,
                created_at: row.get(6)?,
                completed_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_versions(connection: &Connection, project_id: &str) -> Result<Vec<VersionRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, version_type, snapshot_json, created_at
             FROM versions
             WHERE project_id = ?1
             ORDER BY created_at DESC
             LIMIT 16",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(VersionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                version_type: row.get(2)?,
                snapshot_json: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[derive(Debug, Clone)]
struct ExtractionChunk {
    id: String,
    source_file_id: String,
    file_name: String,
    file_type: String,
    content: String,
}

#[derive(Debug, Clone)]
struct MapItem {
    id: String,
    name: String,
    item_type: String,
    description: String,
    confidence_status: String,
    impact_score: i64,
    source_count: i64,
}

fn load_chunks_for_extraction(
    connection: &Connection,
    project_id: &str,
    selected_ids: Option<Vec<String>>,
) -> Result<Vec<ExtractionChunk>, String> {
    let selected = selected_ids.unwrap_or_default();
    let use_selection = !selected.is_empty();
    let selected_set = selected
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    let mut statement = connection
        .prepare(
            "SELECT sc.id, sc.source_file_id, sf.file_name, sf.file_type, sc.content_path
             FROM source_chunks sc
             JOIN source_files sf ON sf.id = sc.source_file_id
             WHERE sc.project_id = ?1
             ORDER BY sf.created_at DESC, sc.chunk_index ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            let content_path: String = row.get(4)?;
            Ok(ExtractionChunk {
                id: row.get(0)?,
                source_file_id: row.get(1)?,
                file_name: row.get(2)?,
                file_type: row.get(3)?,
                content: fs::read_to_string(content_path).unwrap_or_default(),
            })
        })
        .map_err(|error| error.to_string())?;
    let chunks = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(chunks
        .into_iter()
        .filter(|chunk| !use_selection || selected_set.contains(&chunk.id))
        .take(48)
        .filter(|chunk| !chunk.content.trim().is_empty())
        .collect())
}

fn build_extracted_items_output(chunks: &[ExtractionChunk]) -> Value {
    let mut grouped = HashMap::<String, Vec<&ExtractionChunk>>::new();
    for chunk in chunks {
        grouped
            .entry(chunk.source_file_id.clone())
            .or_default()
            .push(chunk);
    }

    let mut items = Vec::new();
    for source_chunks in grouped.values().take(12) {
        let first = source_chunks[0];
        let merged = source_chunks
            .iter()
            .take(4)
            .map(|chunk| chunk.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        let item_type = infer_item_type(&merged, &first.file_name, &first.file_type);
        let name = inferred_item_name(&item_type, &first.file_name, &merged);
        let sources = source_chunks
            .iter()
            .take(3)
            .map(|chunk| {
                json!({
                    "sourceChunkId": chunk.id,
                    "sourceFileId": chunk.source_file_id,
                    "quote": truncate_chars(&chunk.content, 180),
                })
            })
            .collect::<Vec<_>>();

        items.push(json!({
            "name": name,
            "itemType": item_type,
            "description": inferred_description(&merged),
            "confidenceStatus": if merged.chars().count() > 120 { "estimated" } else { "needs_review" },
            "impactScore": inferred_impact_score(&merged),
            "subjectiveImportance": 2,
            "memo": null,
            "sources": sources,
        }));
    }

    if !items
        .iter()
        .any(|item| item.get("itemType").and_then(Value::as_str) == Some("business"))
    {
        if let Some(first) = chunks.first() {
            items.insert(
                0,
                json!({
                    "name": "既存事業",
                    "itemType": "business",
                    "description": "投入資料から確認した既存事業の中心要素です。",
                    "confidenceStatus": "needs_review",
                    "impactScore": 2,
                    "subjectiveImportance": 2,
                    "memo": null,
                    "sources": [{
                        "sourceChunkId": first.id,
                        "sourceFileId": first.source_file_id,
                        "quote": truncate_chars(&first.content, 180),
                    }]
                }),
            );
        }
    }

    json!({
        "schemaVersion": SCHEMA_VERSION,
        "items": items,
    })
}

fn extraction_prompt(chunks: &[ExtractionChunk]) -> String {
    let summaries = chunks
        .iter()
        .take(24)
        .map(|chunk| {
            format!(
                "- chunkId: {}\n  sourceFileId: {}\n  fileType: {}\n  localSummary: {}",
                chunk.id,
                chunk.source_file_id,
                chunk.file_type,
                summarize_chunk_for_ai(chunk)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "MVP-1のシナジーマップ用に、以下のsource chunks要約から抽出カードを生成してください。\
         事業、商品・サービス、集客チャネル、顧客接点、財務参考情報、データ資料に分類し、\
         confidenceStatusはconfirmed/estimated/needs_review、itemTypeはbusiness/service/channel/touchpoint/finance/data_sourceを使ってください。\
         sourcesには根拠にしたsourceChunkId/sourceFileIdを入れてください。schemaVersionは{}です。\n\n{}",
        SCHEMA_VERSION, summaries
    )
}

fn summarize_chunk_for_ai(chunk: &ExtractionChunk) -> String {
    let keywords = infer_summary_keywords(&chunk.content);
    let category = infer_item_type(&chunk.content, "", &chunk.file_type);
    let line_count = chunk
        .content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();
    let length_bucket = match chunk.content.chars().count() {
        0..=240 => "short",
        241..=1200 => "medium",
        _ => "long",
    };
    let impact_score = inferred_impact_score(&chunk.content);
    let source_density = if line_count > 24 {
        "structured"
    } else {
        "narrative"
    };

    if keywords.is_empty() {
        format!(
            "推定分類: {category}。情報量: {length_bucket}。構造: {source_density}。影響度推定: {impact_score}。"
        )
    } else {
        format!(
            "推定分類: {category}。主要語: {}。情報量: {length_bucket}。構造: {source_density}。影響度推定: {impact_score}。",
            keywords.join("、"),
        )
    }
}

fn infer_summary_keywords(content: &str) -> Vec<&'static str> {
    [
        "売上",
        "粗利",
        "利益",
        "顧客",
        "問い合わせ",
        "商談",
        "購入",
        "継続",
        "紹介",
        "Web",
        "LINE",
        "広告",
        "展示会",
        "サービス",
        "商品",
        "保守",
        "データ",
    ]
    .into_iter()
    .filter(|keyword| content.contains(keyword))
    .take(8)
    .collect()
}

fn infer_item_type(content: &str, file_name: &str, file_type: &str) -> String {
    let source = format!("{content}\n{file_name}").to_lowercase();

    if ["売上", "粗利", "利益", "財務", "financial", "sales"]
        .iter()
        .any(|keyword| source.contains(keyword))
    {
        "finance".to_string()
    } else if ["csv", "xlsx", "xls"]
        .iter()
        .any(|extension| file_name.to_lowercase().ends_with(extension))
        || matches!(file_type, "csv" | "xlsx" | "xls")
    {
        "data_source".to_string()
    } else if [
        "web",
        "ec",
        "line",
        "広告",
        "展示会",
        "紹介",
        "sns",
        "チャネル",
    ]
    .iter()
    .any(|keyword| source.contains(keyword))
    {
        "channel".to_string()
    } else if ["問い合わせ", "商談", "購入", "継続", "接点", "顧客"]
        .iter()
        .any(|keyword| source.contains(keyword))
    {
        "touchpoint".to_string()
    } else if ["サービス", "商品", "プロダクト", "保守"]
        .iter()
        .any(|keyword| source.contains(keyword))
    {
        "service".to_string()
    } else {
        "business".to_string()
    }
}

fn inferred_item_name(item_type: &str, file_name: &str, content: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name)
        .replace(['-', '_'], " ");
    let prefix = match item_type {
        "business" => "事業",
        "service" => "商品・サービス",
        "channel" => "集客チャネル",
        "touchpoint" => "顧客接点",
        "finance" => "財務参考情報",
        "data_source" => "データ資料",
        _ => "抽出項目",
    };
    let candidate = content
        .lines()
        .map(str::trim)
        .find(|line| line.chars().count() >= 4 && line.chars().count() <= 24)
        .unwrap_or(&stem);

    format!("{prefix}: {}", truncate_chars(candidate, 24))
}

fn inferred_description(content: &str) -> String {
    let summary = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join(" / ");

    if summary.is_empty() {
        "資料から抽出した確認対象です。".to_string()
    } else {
        truncate_chars(&summary, 180)
    }
}

fn inferred_impact_score(content: &str) -> i64 {
    if ["売上", "主要", "継続", "購買", "重要"]
        .iter()
        .any(|keyword| content.contains(keyword))
    {
        3
    } else {
        2
    }
}

fn insert_extracted_items(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    ai_run_id: &str,
    output: &crate::ai_schema::ExtractedItemsOutput,
) -> Result<(), String> {
    let now = now_rfc3339()?;

    for item in &output.items {
        let item_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO extracted_items (
                    id, project_id, ai_run_id, name, item_type, description,
                    confidence_status, impact_score, subjective_importance, adoption_status,
                    memo, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'accepted', ?10, ?11, ?12)",
                params![
                    item_id,
                    project_id,
                    ai_run_id,
                    item.name,
                    item.item_type,
                    item.description,
                    item.confidence_status,
                    item.impact_score,
                    item.subjective_importance,
                    item.memo,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;

        for source in &item.sources {
            let source_id = Uuid::new_v4().to_string();
            let reference = resolve_source_reference(
                transaction,
                project_id,
                source.source_chunk_id.as_deref(),
                source.source_file_id.as_deref(),
            )?;
            transaction
                .execute(
                    "INSERT INTO item_sources (
                        id, project_id, extracted_item_id, source_file_id, source_chunk_id,
                        quote, page_number, sheet_name, row_start, row_end, heading_path, created_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![
                        source_id,
                        project_id,
                        item_id,
                        reference.source_file_id,
                        reference.source_chunk_id,
                        source.quote,
                        reference
                            .location
                            .as_ref()
                            .and_then(|value| value.page_number),
                        reference
                            .location
                            .as_ref()
                            .and_then(|value| value.sheet_name.clone()),
                        reference
                            .location
                            .as_ref()
                            .and_then(|value| value.row_start),
                        reference.location.as_ref().and_then(|value| value.row_end),
                        reference
                            .location
                            .as_ref()
                            .and_then(|value| value.heading_path.clone()),
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

struct ChunkLocation {
    source_file_id: String,
    page_number: Option<i64>,
    sheet_name: Option<String>,
    row_start: Option<i64>,
    row_end: Option<i64>,
    heading_path: Option<String>,
}

struct SourceReference {
    source_file_id: Option<String>,
    source_chunk_id: Option<String>,
    location: Option<ChunkLocation>,
}

fn resolve_source_reference(
    connection: &rusqlite::Transaction<'_>,
    project_id: &str,
    source_chunk_id: Option<&str>,
    source_file_id: Option<&str>,
) -> Result<SourceReference, String> {
    if let Some(chunk_id) = source_chunk_id {
        let location = connection
            .query_row(
                "SELECT source_file_id, page_number, sheet_name, row_start, row_end, heading_path
                 FROM source_chunks
                 WHERE id = ?1 AND project_id = ?2",
                params![chunk_id, project_id],
                |row| {
                    Ok(ChunkLocation {
                        source_file_id: row.get(0)?,
                        page_number: row.get(1)?,
                        sheet_name: row.get(2)?,
                        row_start: row.get(3)?,
                        row_end: row.get(4)?,
                        heading_path: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("sourceChunkId does not belong to this project: {chunk_id}"))?;
        return Ok(SourceReference {
            source_file_id: Some(location.source_file_id.clone()),
            source_chunk_id: Some(chunk_id.to_string()),
            location: Some(location),
        });
    }

    let valid_source_file_id = if let Some(file_id) = source_file_id {
        Some(
            connection
                .query_row(
                    "SELECT id FROM source_files WHERE id = ?1 AND project_id = ?2",
                    params![file_id, project_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|error| error.to_string())?
                .ok_or_else(|| {
                    format!("sourceFileId does not belong to this project: {file_id}")
                })?,
        )
    } else {
        None
    };

    if valid_source_file_id.is_none() {
        return Err("source reference must include sourceChunkId or sourceFileId.".to_string());
    }

    Ok(SourceReference {
        source_file_id: valid_source_file_id,
        source_chunk_id: None,
        location: None,
    })
}

fn validate_extracted_item_source_refs(
    connection: &Connection,
    project_id: &str,
    output: &crate::ai_schema::ExtractedItemsOutput,
) -> Result<(), String> {
    for item in &output.items {
        for source in &item.sources {
            if let Some(chunk_id) = source.source_chunk_id.as_deref() {
                let exists = connection
                    .query_row(
                        "SELECT 1 FROM source_chunks WHERE id = ?1 AND project_id = ?2",
                        params![chunk_id, project_id],
                        |row| row.get::<_, i64>(0),
                    )
                    .optional()
                    .map_err(|error| error.to_string())?
                    .is_some();
                if !exists {
                    return Err(format!(
                        "sourceChunkId does not belong to this project: {chunk_id}"
                    ));
                }
                continue;
            }

            let Some(file_id) = source.source_file_id.as_deref() else {
                return Err(
                    "source reference must include sourceChunkId or sourceFileId.".to_string(),
                );
            };
            let exists = connection
                .query_row(
                    "SELECT id FROM source_files WHERE id = ?1 AND project_id = ?2",
                    params![file_id, project_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|error| error.to_string())?
                .is_some();
            if !exists {
                return Err(format!(
                    "sourceFileId does not belong to this project: {file_id}"
                ));
            }
        }
    }

    Ok(())
}

fn load_items_for_map(connection: &Connection, project_id: &str) -> Result<Vec<MapItem>, String> {
    let items = load_extracted_items(connection, project_id)?;
    Ok(items
        .into_iter()
        .filter(|item| item.adoption_status != "rejected")
        .map(|item| MapItem {
            id: item.id,
            name: item.name,
            item_type: item.item_type,
            description: item.description.unwrap_or_default(),
            confidence_status: item.confidence_status,
            impact_score: item.impact_score,
            source_count: item.sources.len() as i64,
        })
        .collect())
}

fn build_map_output(items: &[MapItem]) -> Value {
    let mut category_counts = HashMap::<String, usize>::new();
    let nodes = items
        .iter()
        .map(|item| {
            let count = category_counts.entry(item.item_type.clone()).or_default();
            let position = default_position(&item.item_type, *count);
            *count += 1;
            json!({
                "extractedItemId": item.id,
                "name": item.name,
                "nodeType": item.item_type,
                "description": item.description,
                "confidenceStatus": item.confidence_status,
                "impactScore": item.impact_score,
                "informationRichness": (45 + (item.source_count * 18)).clamp(35, 95),
                "positionX": position.0,
                "positionY": position.1,
            })
        })
        .collect::<Vec<_>>();
    let edges = build_map_edges(items);

    json!({
        "schemaVersion": SCHEMA_VERSION,
        "nodes": nodes,
        "edges": edges,
    })
}

fn map_prompt(items: &[MapItem]) -> String {
    let summaries = items
        .iter()
        .map(|item| {
            format!(
                "- id: {}\n  name: {}\n  type: {}\n  confidence: {}\n  summary: {}",
                item.id, item.name, item.item_type, item.confidence_status, item.description
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "MVP-1の顧客導線ビューとして、抽出カードから1枚のシナジーマップを生成してください。\
         nodesは読みやすい2D座標で配置し、edgesはawareness/inquiry/proposal/purchase/retention/referral/data_referenceから選んでください。\
         nodeTypeはbusiness/service/channel/touchpoint/finance/data_source、schemaVersionは{}です。\n\n{}",
        SCHEMA_VERSION, summaries
    )
}

fn default_position(item_type: &str, index: usize) -> (f64, f64) {
    let y = 90.0 + (index as f64 * 128.0);
    match item_type {
        "business" => (90.0, y),
        "channel" => (360.0, y),
        "touchpoint" => (640.0, y),
        "service" => (910.0, y),
        "finance" => (910.0, y + 150.0),
        "data_source" => (90.0, y + 270.0),
        _ => (360.0, y),
    }
}

fn build_map_edges(items: &[MapItem]) -> Vec<Value> {
    let find = |kind: &str| items.iter().find(|item| item.item_type == kind);
    let business = find("business").or_else(|| items.first());
    let channel = find("channel");
    let touchpoint = find("touchpoint");
    let service = find("service");
    let data_source = find("data_source").or_else(|| find("finance"));
    let mut edges = Vec::new();

    if let (Some(channel), Some(touchpoint)) = (channel, touchpoint) {
        edges.push(edge_json(
            channel,
            touchpoint,
            "normal",
            "inquiry",
            "問い合わせ",
        ));
    }
    if let (Some(touchpoint), Some(service)) = (touchpoint, service.or(business)) {
        edges.push(edge_json(touchpoint, service, "strong", "proposal", "提案"));
    }
    if let (Some(service), Some(business)) = (service, business) {
        edges.push(edge_json(service, business, "strong", "purchase", "購入"));
    }
    if let (Some(data_source), Some(touchpoint)) = (data_source, touchpoint.or(service)) {
        edges.push(edge_json(
            data_source,
            touchpoint,
            "weak",
            "data_reference",
            "データ連携",
        ));
    }

    if edges.is_empty() {
        for pair in items.windows(2) {
            edges.push(edge_json(&pair[0], &pair[1], "normal", "awareness", "認知"));
        }
    }

    edges
}

fn edge_json(
    source: &MapItem,
    target: &MapItem,
    edge_type: &str,
    flow_type: &str,
    label: &str,
) -> Value {
    json!({
        "sourceNodeLabel": source.name,
        "targetNodeLabel": target.name,
        "edgeType": edge_type,
        "flowType": flow_type,
        "strength": if edge_type == "weak" { "weak" } else if edge_type == "strong" { "strong" } else { "normal" },
        "confidenceStatus": "estimated",
        "label": label,
        "evidence": "抽出カードの分類と出典から生成したMVP-1初期導線です。",
    })
}

fn insert_map(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    output: &crate::ai_schema::MapDraftOutput,
) -> Result<(), String> {
    let now = now_rfc3339()?;
    let mut label_to_id = HashMap::<String, String>::new();

    for node in &output.nodes {
        let id = Uuid::new_v4().to_string();
        label_to_id.insert(node.name.clone(), id.clone());
        transaction
            .execute(
                "INSERT INTO nodes (
                    id, project_id, extracted_item_id, node_type, label, description,
                    influence_level, information_richness, confidence_status, badges_json,
                    position_json, adoption_status, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'accepted', ?12, ?13)",
                params![
                    id,
                    project_id,
                    node.extracted_item_id,
                    node.node_type,
                    node.name,
                    node.description,
                    node.impact_score.to_string(),
                    node.information_richness.to_string(),
                    node.confidence_status,
                    json!(["AI注目"]).to_string(),
                    json!({ "x": node.position_x, "y": node.position_y }).to_string(),
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    for edge in &output.edges {
        let Some(source_id) = label_to_id.get(&edge.source_node_label) else {
            continue;
        };
        let Some(target_id) = label_to_id.get(&edge.target_node_label) else {
            continue;
        };
        transaction
            .execute(
                "INSERT INTO edges (
                    id, project_id, source_node_id, target_node_id, edge_type, flow_type,
                    strength, direction, confidence_status, evidence, label, adoption_status,
                    created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'forward', ?8, ?9, ?10, 'accepted', ?11, ?12)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id,
                    source_id,
                    target_id,
                    edge.edge_type,
                    edge.flow_type,
                    edge.strength,
                    edge.confidence_status,
                    edge.evidence,
                    edge.label,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn build_analysis_output(workspace: &ProjectWorkspace) -> Value {
    let node_names = workspace
        .nodes
        .iter()
        .take(4)
        .map(|node| node.label.clone())
        .collect::<Vec<_>>();
    let summary = if node_names.is_empty() {
        "現時点ではマップに十分なノードがありません。".to_string()
    } else {
        format!(
            "{}を中心に、顧客接点と提供価値の導線を確認できます。",
            node_names.join("、")
        )
    };

    json!({
        "schemaVersion": SCHEMA_VERSION,
        "summary": summary,
        "strongFlows": workspace.edges.iter().filter(|edge| edge.strength.as_deref() == Some("strong")).take(3).map(|edge| edge.label.clone().unwrap_or_else(|| "強い導線".to_string())).collect::<Vec<_>>(),
        "bottlenecks": ["商談後の継続接点とデータ活用の確認が必要です。"],
        "unconnectedSynergies": ["データ資料と集客チャネルを接続できる余地があります。"],
        "questions": ["継続契約につながる主要な接点はどこですか？", "売上CSVと顧客台帳は同じ顧客IDで接続できますか？"],
        "opportunities": [{
            "title": "接点データを使った継続導線の強化",
            "rationale": "マップ上で接点とデータ資料が分かれているため、統合すると再提案の精度が上がる可能性があります。",
            "expectedImpact": "継続率と商談化率の改善"
        }],
        "risks": ["資料だけでは推定のため、クライアント確認が必要です。"]
    })
}

fn analysis_prompt(workspace: &ProjectWorkspace) -> String {
    let nodes = workspace
        .nodes
        .iter()
        .map(|node| format!("- node: {} ({})", node.label, node.node_type))
        .collect::<Vec<_>>()
        .join("\n");
    let edges = workspace
        .edges
        .iter()
        .map(|edge| {
            format!(
                "- edge: {} -> {} / {} / {}",
                edge.source_node_id,
                edge.target_node_id,
                edge.label.as_deref().unwrap_or("導線"),
                edge.strength.as_deref().unwrap_or("normal")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "MVP-1のシナジーマップから、現状の全体像、強い導線、詰まり、未接続シナジー候補、確認質問、簡易施策を日本語で短く生成してください。schemaVersionは{}です。\n\nNodes:\n{}\n\nEdges:\n{}",
        SCHEMA_VERSION, nodes, edges
    )
}

fn build_suggestions_output(_workspace: &ProjectWorkspace) -> Value {
    json!({
        "schemaVersion": SCHEMA_VERSION,
        "cards": [
            {
                "title": "問い合わせ後フォロー導線の整理",
                "action": "Web問い合わせから初回商談までの担当、期限、記録先を確認する。",
                "priority": "high",
                "rationale": "顧客接点の詰まりを最初に解消しやすい。"
            },
            {
                "title": "顧客台帳と売上CSVの突合",
                "action": "顧客ID、会社名、メールアドレスのどれで紐づくか確認する。",
                "priority": "medium",
                "rationale": "データ資料を施策判断に使える状態にするため。"
            },
            {
                "title": "展示会リードの再接触条件",
                "action": "再接触すべきリード条件と除外条件をヒアリングする。",
                "priority": "medium",
                "rationale": "未接続チャネルを既存サービスへつなげるため。"
            }
        ]
    })
}

fn insert_ai_comments(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    ai_run_id: &str,
    output: &crate::ai_schema::AiAnalysisOutput,
) -> Result<(), String> {
    let now = now_rfc3339()?;
    let mut comments = vec![(
        "summary",
        "現状の全体像".to_string(),
        output.summary.clone(),
    )];

    comments.extend(
        output
            .strong_flows
            .iter()
            .map(|body| ("strong_flow", "強い導線".to_string(), body.clone())),
    );
    comments.extend(
        output
            .bottlenecks
            .iter()
            .map(|body| ("bottleneck", "詰まり".to_string(), body.clone())),
    );
    comments.extend(
        output
            .unconnected_synergies
            .iter()
            .map(|body| ("unconnected", "未接続シナジー".to_string(), body.clone())),
    );
    comments.extend(
        output
            .questions
            .iter()
            .map(|body| ("question", "確認質問".to_string(), body.clone())),
    );

    for (comment_type, title, body) in comments {
        transaction
            .execute(
                "INSERT INTO ai_comments (
                    id, project_id, ai_run_id, comment_type, title, body, confidence_status, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'estimated', ?7)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id,
                    ai_run_id,
                    comment_type,
                    title,
                    body,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn insert_suggestions(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    ai_run_id: &str,
    output: &crate::ai_schema::SuggestionCardsOutput,
) -> Result<(), String> {
    let now = now_rfc3339()?;

    for card in &output.cards {
        transaction
            .execute(
                "INSERT INTO suggestions (
                    id, project_id, ai_run_id, title, description, priority,
                    adoption_status, rationale, related_node_ids_json, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, '[]', ?8, ?9)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id,
                    ai_run_id,
                    card.title,
                    card.action,
                    card.priority,
                    card.rationale,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn pending_ai_run_status(final_status: &str) -> &'static str {
    if final_status == "fallback_completed" {
        "fallback_response_validated"
    } else {
        "response_validated"
    }
}

fn finalize_ai_run_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    ai_run_id: &str,
    status: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "UPDATE ai_runs SET status = ?1 WHERE id = ?2",
            params![status, ai_run_id],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn save_ai_run(
    connection: &Connection,
    app_data_dir: &Path,
    project_id: &str,
    run_type: &str,
    schema_name: &str,
    model: &str,
    status: &str,
    request_summary: Value,
    response_json: &Value,
    error: Option<String>,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;
    let run_dir = ai_runs_dir(app_data_dir, project_id).join(&id);
    let request_summary_path = run_dir.join("request-summary.json");
    let response_json_path = run_dir.join("response.json");
    let input_hash = request_summary
        .get("promptHash")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| hash_text(&request_summary.to_string()));

    fs::create_dir_all(&run_dir).map_err(|error| error.to_string())?;
    fs::write(
        &request_summary_path,
        serde_json::to_vec_pretty(&request_summary).map_err(|error| error.to_string())?,
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
                id, project_id, run_type, schema_name, schema_version, input_hash, model,
                status, started_at, completed_at, error, request_summary_path,
                response_json_path, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                id,
                project_id,
                run_type,
                schema_name,
                SCHEMA_VERSION,
                input_hash,
                model,
                status,
                now,
                now,
                error,
                request_summary_path.display().to_string(),
                response_json_path.display().to_string(),
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(id)
}

fn record_snapshot_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    version_type: &str,
) -> Result<(), String> {
    let now = now_rfc3339()?;
    let snapshot = json!({
        "versionType": version_type,
        "capturedAt": now,
        "extractedItems": snapshot_table(
            transaction,
            "extracted_items",
            &[
                "id",
                "name",
                "item_type",
                "description",
                "confidence_status",
                "impact_score",
                "subjective_importance",
                "adoption_status",
                "memo",
                "updated_at",
            ],
            project_id,
        )?,
        "itemSources": snapshot_table(
            transaction,
            "item_sources",
            &[
                "id",
                "extracted_item_id",
                "source_file_id",
                "source_chunk_id",
                "quote",
                "page_number",
                "sheet_name",
                "row_start",
                "row_end",
                "heading_path",
            ],
            project_id,
        )?,
        "nodes": snapshot_table(
            transaction,
            "nodes",
            &[
                "id",
                "extracted_item_id",
                "node_type",
                "label",
                "description",
                "influence_level",
                "information_richness",
                "confidence_status",
                "position_json",
                "adoption_status",
                "memo",
            ],
            project_id,
        )?,
        "edges": snapshot_table(
            transaction,
            "edges",
            &[
                "id",
                "source_node_id",
                "target_node_id",
                "edge_type",
                "flow_type",
                "strength",
                "confidence_status",
                "label",
                "adoption_status",
                "note",
            ],
            project_id,
        )?,
        "suggestions": snapshot_table(
            transaction,
            "suggestions",
            &[
                "id",
                "title",
                "description",
                "priority",
                "adoption_status",
                "rationale",
                "memo",
            ],
            project_id,
        )?,
        "aiComments": snapshot_table(
            transaction,
            "ai_comments",
            &[
                "id",
                "comment_type",
                "title",
                "body",
                "confidence_status",
                "created_at",
            ],
            project_id,
        )?,
        "counts": {
            "extractedItems": count_table(transaction, "extracted_items", project_id)?,
            "itemSources": count_table(transaction, "item_sources", project_id)?,
            "nodes": count_table(transaction, "nodes", project_id)?,
            "edges": count_table(transaction, "edges", project_id)?,
            "suggestions": count_table(transaction, "suggestions", project_id)?,
            "aiComments": count_table(transaction, "ai_comments", project_id)?,
        }
    });

    transaction
        .execute(
            "INSERT INTO versions (id, project_id, version_type, snapshot_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                Uuid::new_v4().to_string(),
                project_id,
                version_type,
                snapshot.to_string(),
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn snapshot_table(
    connection: &rusqlite::Transaction<'_>,
    table_name: &str,
    columns: &[&str],
    project_id: &str,
) -> Result<Vec<Value>, String> {
    let sql = format!(
        "SELECT {} FROM {table_name} WHERE project_id = ?1 ORDER BY id ASC",
        columns.join(", ")
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            let mut object = serde_json::Map::new();
            for (index, column) in columns.iter().enumerate() {
                object.insert(column.to_string(), value_ref_to_json(row.get_ref(index)?));
            }
            Ok(Value::Object(object))
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn value_ref_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => json!(value),
        ValueRef::Real(value) => json!(value),
        ValueRef::Text(value) => json!(String::from_utf8_lossy(value).to_string()),
        ValueRef::Blob(value) => json!(hex::encode(value)),
    }
}

fn count_table(
    connection: &rusqlite::Transaction<'_>,
    table_name: &str,
    project_id: &str,
) -> Result<i64, String> {
    let sql = format!("SELECT COUNT(*) FROM {table_name} WHERE project_id = ?1");
    connection
        .query_row(&sql, [project_id], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn project_name(connection: &Connection, project_id: &str) -> Result<String, String> {
    connection
        .query_row(
            "SELECT name FROM projects WHERE id = ?1",
            [project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn render_markdown(project_name: &str, workspace: &ProjectWorkspace) -> String {
    let mut body = String::new();

    body.push_str(&format!("# {project_name} シナジーマップ\n\n"));
    body.push_str("## 概要\n\n");
    if let Some(summary) = workspace
        .ai_comments
        .iter()
        .find(|comment| comment.comment_type == "summary")
    {
        body.push_str(&format!("{}\n\n", summary.body));
    } else {
        body.push_str("資料投入、抽出カード、顧客導線マップのMVP-1出力です。\n\n");
    }

    body.push_str("## 使用資料\n\n");
    for source in &workspace.source_files {
        body.push_str(&format!(
            "- {} ({}, {}, {} chunks)\n",
            source.file_name, source.file_type, source.status, source.chunk_count
        ));
    }

    body.push_str("\n## 抽出カード\n\n");
    for item in &workspace.extracted_items {
        body.push_str(&format!(
            "- **{}** / {} / {} / {}\n",
            item.name, item.item_type, item.confidence_status, item.adoption_status
        ));
        if let Some(description) = item.description.as_deref() {
            body.push_str(&format!("  - {}\n", description));
        }
    }

    body.push_str("\n## 顧客導線マップ要約\n\n");
    body.push_str(&format!(
        "- ノード: {}件\n- 導線: {}件\n\n",
        workspace.nodes.len(),
        workspace.edges.len()
    ));
    for edge in &workspace.edges {
        let source = workspace
            .nodes
            .iter()
            .find(|node| node.id == edge.source_node_id)
            .map(|node| node.label.as_str())
            .unwrap_or("source");
        let target = workspace
            .nodes
            .iter()
            .find(|node| node.id == edge.target_node_id)
            .map(|node| node.label.as_str())
            .unwrap_or("target");
        body.push_str(&format!(
            "- {} -> {}: {}\n",
            source,
            target,
            edge.label.as_deref().unwrap_or("導線")
        ));
    }

    body.push_str("\n## AIコメント\n\n");
    for comment in &workspace.ai_comments {
        body.push_str(&format!("- **{}**: {}\n", comment.title, comment.body));
    }

    body.push_str("\n## 施策カード\n\n");
    for suggestion in &workspace.suggestions {
        body.push_str(&format!(
            "- **{}** [{}]: {}\n",
            suggestion.title, suggestion.priority, suggestion.description
        ));
    }

    body.push_str("\n## 確認質問\n\n");
    for question in workspace
        .ai_comments
        .iter()
        .filter(|comment| comment.comment_type == "question")
    {
        body.push_str(&format!("- {}\n", question.body));
    }

    body
}

fn timestamp_for_file(now: &str) -> String {
    now.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect()
}

fn insert_export_job(
    connection: &Connection,
    project_id: &str,
    export_type: &str,
    output_path: &Path,
    now: &str,
) -> Result<ExportJobRow, String> {
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO export_jobs (
                id, project_id, export_type, status, output_path, created_at, completed_at
             ) VALUES (?1, ?2, ?3, 'completed', ?4, ?5, ?6)",
            params![
                id,
                project_id,
                export_type,
                output_path.display().to_string(),
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .query_row(
            "SELECT id, project_id, export_type, status, output_path, error, created_at, completed_at
             FROM export_jobs WHERE id = ?1",
            [id],
            |row| {
                Ok(ExportJobRow {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    export_type: row.get(2)?,
                    status: row.get(3)?,
                    output_path: row.get(4)?,
                    error: row.get(5)?,
                    created_at: row.get(6)?,
                    completed_at: row.get(7)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn csv_writer(path: &Path) -> Result<csv::Writer<std::fs::File>, String> {
    csv::WriterBuilder::new()
        .terminator(Terminator::Any(b'\n'))
        .from_path(path)
        .map_err(|error| error.to_string())
}

fn write_nodes_csv(path: &Path, nodes: &[MapNodeRow]) -> Result<(), String> {
    let mut writer = csv_writer(path)?;
    writer
        .write_record([
            "id",
            "label",
            "node_type",
            "confidence_status",
            "influence_level",
            "information_richness",
            "adoption_status",
            "memo",
        ])
        .map_err(|error| error.to_string())?;
    for node in nodes {
        writer
            .write_record([
                node.id.as_str(),
                node.label.as_str(),
                node.node_type.as_str(),
                node.confidence_status.as_deref().unwrap_or(""),
                node.influence_level.as_deref().unwrap_or(""),
                node.information_richness.as_deref().unwrap_or(""),
                node.adoption_status.as_str(),
                node.memo.as_deref().unwrap_or(""),
            ])
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

fn write_edges_csv(path: &Path, edges: &[MapEdgeRow]) -> Result<(), String> {
    let mut writer = csv_writer(path)?;
    writer
        .write_record([
            "id",
            "source_node_id",
            "target_node_id",
            "label",
            "edge_type",
            "flow_type",
            "strength",
            "confidence_status",
            "adoption_status",
        ])
        .map_err(|error| error.to_string())?;
    for edge in edges {
        writer
            .write_record([
                edge.id.as_str(),
                edge.source_node_id.as_str(),
                edge.target_node_id.as_str(),
                edge.label.as_deref().unwrap_or(""),
                edge.edge_type.as_str(),
                edge.flow_type.as_deref().unwrap_or(""),
                edge.strength.as_deref().unwrap_or(""),
                edge.confidence_status.as_deref().unwrap_or(""),
                edge.adoption_status.as_str(),
            ])
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

fn write_suggestions_csv(path: &Path, suggestions: &[SuggestionRow]) -> Result<(), String> {
    let mut writer = csv_writer(path)?;
    writer
        .write_record([
            "id",
            "title",
            "description",
            "priority",
            "adoption_status",
            "rationale",
        ])
        .map_err(|error| error.to_string())?;
    for suggestion in suggestions {
        writer
            .write_record([
                suggestion.id.as_str(),
                suggestion.title.as_str(),
                suggestion.description.as_str(),
                suggestion.priority.as_str(),
                suggestion.adoption_status.as_str(),
                suggestion.rationale.as_deref().unwrap_or(""),
            ])
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

fn write_sources_csv(path: &Path, sources: &[SourceFileRow]) -> Result<(), String> {
    let mut writer = csv_writer(path)?;
    writer
        .write_record([
            "id",
            "file_name",
            "file_type",
            "status",
            "chunk_count",
            "stored_location",
        ])
        .map_err(|error| error.to_string())?;
    for source in sources {
        writer
            .write_record([
                source.id.as_str(),
                source.file_name.as_str(),
                source.file_type.as_str(),
                source.status.as_str(),
                &source.chunk_count.to_string(),
                "[app-data]/projects/{project}/sources",
            ])
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}
