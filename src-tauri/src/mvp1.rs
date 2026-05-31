use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use csv::Terminator;
use rusqlite::{params, types::ValueRef, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::ai_provider::StructuredAiResult;
use crate::ai_schema::{
    ai_analysis_json_schema, extracted_items_json_schema, map_draft_json_schema,
    map_insight_json_schema, suggestion_cards_json_schema, validate_ai_analysis_json,
    validate_extracted_items_json, validate_map_draft_json, validate_map_insight_json,
    validate_suggestion_cards_json, SCHEMA_VERSION,
};
use crate::app_settings::load_ai_settings;
use crate::DbState;

const LOCAL_MODEL: &str = "mvp-local-draft";

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
    expected_revenue_impact: String,
    expected_profit_impact: String,
    cost_level: String,
    effort_level: String,
    time_to_impact: String,
    confidence_status: String,
    impact_score: i64,
    evidence: Option<String>,
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
    name: Option<String>,
    memo: Option<String>,
    snapshot_json: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewLayoutRow {
    id: String,
    project_id: String,
    view_id: String,
    layout_json: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionItemRow {
    id: String,
    project_id: String,
    ai_run_id: Option<String>,
    source_type: String,
    source_id: Option<String>,
    title: String,
    body: String,
    status: String,
    priority: String,
    memo: Option<String>,
    created_at: String,
    updated_at: String,
    completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapNoteRow {
    id: String,
    project_id: String,
    title: String,
    body: String,
    note_type: String,
    created_at: String,
    updated_at: String,
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
    view_layouts: Vec<ViewLayoutRow>,
    action_items: Vec<ActionItemRow>,
    map_notes: Vec<MapNoteRow>,
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
    warning: Option<String>,
    workspace: ProjectWorkspace,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSourceResult {
    workspace: ProjectWorkspace,
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapPositionInput {
    node_id: String,
    x: f64,
    y: f64,
    width: Option<f64>,
    height: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct MapLayoutValues {
    x: f64,
    y: f64,
    width: Option<f64>,
    height: Option<f64>,
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

fn source_files_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("sources")
}

fn source_chunks_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    project_dir(app_data_dir, project_id).join("extracted")
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

fn try_structured_ai(
    app: AppHandle,
    db_path: &Path,
    prompt: &str,
    schema: Value,
) -> StructuredAiResult {
    let settings = crate::app_settings::load_ai_settings(db_path);
    let cwd = workspace_dir();
    crate::ai_provider::run_structured_ai(
        app,
        &cwd.display().to_string(),
        prompt,
        schema,
        &settings,
    )
}

fn provider_metadata(result: &StructuredAiResult) -> (Option<String>, u64) {
    (
        result
            .provider_used
            .map(|provider| provider.as_str().to_string()),
        result.duration_ms,
    )
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
            "読み取り済みsource chunksがありません。先にマップの材料を追加してください。"
                .to_string(),
        );
    }

    let purpose_context = prompt_purpose_context_from_chunks(&chunks);
    let prompt = extraction_prompt(&chunks, &purpose_context);
    let prompt_hash = hash_text(&prompt);
    let ai_result = try_structured_ai(app, &state.db_path, &prompt, extracted_items_json_schema());
    let (provider_used, duration_ms) = provider_metadata(&ai_result);
    let (output_json, model, status, error, fallback_used, message) = match ai_result.response_json
    {
        Some(value) => (
            value,
            ai_result.model_label,
            "completed",
            None,
            false,
            "抽出カードを生成しました。".to_string(),
        ),
        None => (
            build_extracted_items_output(&chunks),
            LOCAL_MODEL.to_string(),
            "fallback_completed",
            Some(ai_result.errors.join("; ")),
            true,
            "AI実行に失敗したため、ローカルドラフトで抽出カードを生成しました。".to_string(),
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
        &model,
        pending_ai_run_status(status),
        json!({
            "mode": "local_summary_only",
            "fallbackUsed": fallback_used,
            "promptHash": prompt_hash.clone(),
            "sourceChunkCount": chunks.len(),
            "sourceChunkIds": chunks.iter().map(|chunk| chunk.id.clone()).collect::<Vec<_>>(),
            "purpose": purpose_context.request_summary(),
            "generationMode": purpose_context.generation_mode(),
            "providerUsed": provider_used,
            "durationMs": duration_ms,
        }),
        &output_json,
        error,
    )?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for table_name in [
        "suggestions",
        "ai_comments",
        "edges",
        "nodes",
        "view_layouts",
    ] {
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
    clear_map_analysis_in_transaction(&transaction, &project_id)?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_items")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_onboarding_brief_source(
    state: State<'_, DbState>,
    project_id: String,
    company_name: String,
    purpose_id: String,
    purpose_label: String,
    industry: Option<String>,
    memo: Option<String>,
    website_url: Option<String>,
    sns_url: Option<String>,
    website_urls: Option<Vec<String>>,
    sns_urls: Option<Vec<String>>,
    product_info: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let trimmed_company_name = company_name.trim();
    let trimmed_purpose_label = purpose_label.trim();
    let normalized_website_urls = normalize_url_inputs(website_url, website_urls);
    let normalized_sns_urls = normalize_url_inputs(sns_url, sns_urls);

    if trimmed_company_name.is_empty() {
        return Err("事業名 / マップ名を入力してください。".to_string());
    }
    if trimmed_purpose_label.is_empty() {
        return Err("マップ生成の目的を選択してください。".to_string());
    }

    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;

    let source_file_id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;
    let source_dir = source_files_dir(&app_data_dir, &project_id).join(&source_file_id);
    let chunks_dir = source_chunks_dir(&app_data_dir, &project_id).join(&source_file_id);
    let source_path = source_dir.join("onboarding-brief.md");
    let chunk_path = chunks_dir.join("0000.txt");
    let content = onboarding_brief_markdown(
        trimmed_company_name,
        &purpose_id,
        trimmed_purpose_label,
        industry.as_deref(),
        memo.as_deref(),
        &normalized_website_urls,
        &normalized_sns_urls,
        product_info.as_deref(),
    );
    let content_hash = hash_text(&content);
    let metadata_json = json!({
        "sourceKind": "onboarding_brief",
        "purposeId": purpose_id,
        "purposeLabel": trimmed_purpose_label,
        "websiteUrls": &normalized_website_urls,
        "snsUrls": &normalized_sns_urls,
        "informationLevel": onboarding_information_level(&content, &normalized_website_urls, &normalized_sns_urls, product_info.as_deref()),
        "hypothesisMode": onboarding_hypothesis_mode(memo.as_deref(), &normalized_website_urls, &normalized_sns_urls, product_info.as_deref()),
    })
    .to_string();

    fs::create_dir_all(&source_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&chunks_dir).map_err(|error| error.to_string())?;

    let write_result = (|| -> Result<(), String> {
        fs::write(&source_path, &content).map_err(|error| error.to_string())?;
        fs::write(&chunk_path, &content).map_err(|error| error.to_string())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_dir_all(&source_dir);
        let _ = fs::remove_dir_all(&chunks_dir);
        return Err(error);
    }

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let insert_result = (|| -> Result<(), String> {
        transaction
            .execute(
                "INSERT INTO source_files (
                    id, project_id, file_name, file_type, local_path, file_hash, status,
                    metadata_json, created_at, updated_at
                ) VALUES (?1, ?2, ?3, 'onboarding_brief', ?4, ?5, 'read', ?6, ?7, ?8)",
                params![
                    source_file_id.as_str(),
                    project_id.as_str(),
                    "マップ作成メモ.md",
                    source_path.display().to_string(),
                    content_hash.as_str(),
                    metadata_json.as_str(),
                    now.as_str(),
                    now.as_str()
                ],
            )
            .map_err(|error| error.to_string())?;

        transaction
            .execute(
                "INSERT INTO source_chunks (
                    id, project_id, source_file_id, chunk_index, content_path, content_hash,
                    page_number, sheet_name, row_start, row_end, column_start, column_end,
                    heading_path, metadata_json, created_at
                ) VALUES (?1, ?2, ?3, 0, ?4, ?5, NULL, NULL, NULL, NULL, NULL, NULL, ?6, ?7, ?8)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id.as_str(),
                    source_file_id.as_str(),
                    chunk_path.display().to_string(),
                    hash_text(&content),
                    "初回マップ作成",
                    json!({ "sourceKind": "onboarding_brief" }).to_string(),
                    now.as_str()
                ],
            )
            .map_err(|error| error.to_string())?;

        Ok(())
    })();

    if let Err(error) = insert_result {
        let _ = fs::remove_dir_all(&source_dir);
        let _ = fs::remove_dir_all(&chunks_dir);
        return Err(error);
    }

    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn create_text_information_source(
    state: State<'_, DbState>,
    project_id: String,
    source_kind: String,
    title: Option<String>,
    body: Option<String>,
    url: Option<String>,
) -> Result<ProjectWorkspace, String> {
    ensure_allowed_input(
        "source_kind",
        &source_kind,
        &["manual_note", "website_url", "sns_url", "product_info"],
    )?;

    let title = title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| information_source_kind_label(&source_kind));
    let body = body
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let url = url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if matches!(source_kind.as_str(), "website_url" | "sns_url") && url.is_none() {
        return Err("URLを入力してください。".to_string());
    }
    if !matches!(source_kind.as_str(), "website_url" | "sns_url") && body.is_none() {
        return Err("内容を入力してください。".to_string());
    }

    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;

    let source_file_id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;
    let source_dir = source_files_dir(&app_data_dir, &project_id).join(&source_file_id);
    let chunks_dir = source_chunks_dir(&app_data_dir, &project_id).join(&source_file_id);
    let source_path = source_dir.join(format!("{}.md", source_kind));
    let chunk_path = chunks_dir.join("0000.txt");
    let content = information_source_markdown(&source_kind, title, body, url);
    let content_hash = hash_text(&content);
    let metadata_json = json!({
        "sourceKind": source_kind,
        "title": title,
        "url": url,
        "informationLevel": text_information_level(&content),
        "hypothesisMode": false,
    })
    .to_string();

    fs::create_dir_all(&source_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&chunks_dir).map_err(|error| error.to_string())?;

    let write_result = (|| -> Result<(), String> {
        fs::write(&source_path, &content).map_err(|error| error.to_string())?;
        fs::write(&chunk_path, &content).map_err(|error| error.to_string())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_dir_all(&source_dir);
        let _ = fs::remove_dir_all(&chunks_dir);
        return Err(error);
    }

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let insert_result = (|| -> Result<(), String> {
        transaction
            .execute(
                "INSERT INTO source_files (
                    id, project_id, file_name, file_type, local_path, file_hash, status,
                    metadata_json, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'read', ?7, ?8, ?9)",
                params![
                    source_file_id.as_str(),
                    project_id.as_str(),
                    information_source_file_name(&source_kind, title),
                    source_kind.as_str(),
                    source_path.display().to_string(),
                    content_hash.as_str(),
                    metadata_json.as_str(),
                    now.as_str(),
                    now.as_str()
                ],
            )
            .map_err(|error| error.to_string())?;

        transaction
            .execute(
                "INSERT INTO source_chunks (
                    id, project_id, source_file_id, chunk_index, content_path, content_hash,
                    page_number, sheet_name, row_start, row_end, column_start, column_end,
                    heading_path, metadata_json, created_at
                ) VALUES (?1, ?2, ?3, 0, ?4, ?5, NULL, NULL, NULL, NULL, NULL, NULL, ?6, ?7, ?8)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id.as_str(),
                    source_file_id.as_str(),
                    chunk_path.display().to_string(),
                    content_hash.as_str(),
                    information_source_kind_label(&source_kind),
                    json!({ "sourceKind": source_kind }).to_string(),
                    now.as_str()
                ],
            )
            .map_err(|error| error.to_string())?;

        Ok(())
    })();

    if let Err(error) = insert_result {
        let _ = fs::remove_dir_all(&source_dir);
        let _ = fs::remove_dir_all(&chunks_dir);
        return Err(error);
    }

    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn delete_source_file(
    state: State<'_, DbState>,
    project_id: String,
    source_file_id: String,
) -> Result<DeleteSourceResult, String> {
    delete_source_file_inner(&state.db_path, project_id, source_file_id)
}

fn delete_source_file_inner(
    db_path: &PathBuf,
    project_id: String,
    source_file_id: String,
) -> Result<DeleteSourceResult, String> {
    let app_data_dir = app_data_dir_from_db(db_path)?.to_path_buf();
    let mut connection = open_connection(db_path)?;
    ensure_project_exists(&connection, &project_id)?;

    let exists: Option<String> = connection
        .query_row(
            "SELECT id FROM source_files WHERE project_id = ?1 AND id = ?2",
            params![project_id.as_str(), source_file_id.as_str()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if exists.is_none() {
        return Err("情報ソースが見つかりません。".to_string());
    }

    let source_dir = source_files_dir(&app_data_dir, &project_id).join(&source_file_id);
    let chunks_dir = source_chunks_dir(&app_data_dir, &project_id).join(&source_file_id);
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "DELETE FROM source_files WHERE project_id = ?1 AND id = ?2",
            params![project_id.as_str(), source_file_id.as_str()],
        )
        .map_err(|error| error.to_string())?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_delete_source_file")?;
    transaction.commit().map_err(|error| error.to_string())?;

    let mut warnings = Vec::new();
    for directory in [source_dir, chunks_dir] {
        if directory.exists() {
            if let Err(error) = fs::remove_dir_all(&directory) {
                warnings.push(format!(
                    "{} を削除できませんでした: {}",
                    directory.display(),
                    error
                ));
            }
        }
    }

    Ok(DeleteSourceResult {
        workspace: load_workspace(&connection, &project_id)?,
        warnings,
    })
}

fn onboarding_brief_markdown(
    company_name: &str,
    purpose_id: &str,
    purpose_label: &str,
    industry: Option<&str>,
    memo: Option<&str>,
    website_urls: &[String],
    sns_urls: &[String],
    product_info: Option<&str>,
) -> String {
    let mut sections = vec![
        "# 初回マップ作成メモ".to_string(),
        format!("- 事業名 / マップ名: {}", company_name.trim()),
        format!("- マップ生成の目的: {}", purpose_label.trim()),
        format!("- 目的ID: {}", purpose_id.trim()),
    ];

    push_optional_markdown_line(&mut sections, "業種", industry);
    push_optional_markdown_lines(&mut sections, "ホームページURL", website_urls);
    push_optional_markdown_lines(&mut sections, "SNSアカウントURL", sns_urls);
    push_optional_section(&mut sections, "今わかっていること / 困っていること", memo);
    push_optional_section(&mut sections, "商品 / サービス情報", product_info);

    sections.push("## 利用上の注意".to_string());
    sections.push(
        "この情報ソースは、ユーザーが初回マップ作成画面で入力した内容です。情報が少ない場合は仮説を含めて扱い、確度は推定または要確認として整理してください。"
            .to_string(),
    );

    sections.join("\n\n")
}

fn normalize_url_inputs(primary_url: Option<String>, urls: Option<Vec<String>>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized_urls = Vec::new();
    let candidates = primary_url.into_iter().chain(urls.unwrap_or_default());

    for candidate in candidates {
        let trimmed = candidate.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        normalized_urls.push(trimmed.to_string());
    }

    normalized_urls
}

fn information_source_markdown(
    source_kind: &str,
    title: &str,
    body: Option<&str>,
    url: Option<&str>,
) -> String {
    let mut sections = vec![
        format!("# {}", title.trim()),
        format!("- 種別: {}", information_source_kind_label(source_kind)),
    ];

    push_optional_markdown_line(&mut sections, "URL", url);
    push_optional_section(&mut sections, "内容", body);
    sections.push("## 利用上の注意".to_string());
    sections.push(
        "この情報ソースはユーザーが手入力した内容です。URL本文やSNSインサイトは自動取得していないため、必要に応じて推定または要確認として扱ってください。"
            .to_string(),
    );

    sections.join("\n\n")
}

fn information_source_kind_label(source_kind: &str) -> &'static str {
    match source_kind {
        "manual_note" => "自由メモ",
        "website_url" => "ホームページURL",
        "sns_url" => "SNSアカウントURL",
        "product_info" => "商品 / サービス情報",
        _ => "情報ソース",
    }
}

fn information_source_file_name(source_kind: &str, title: &str) -> String {
    let label = information_source_kind_label(source_kind);
    let sanitized_title = title
        .trim()
        .chars()
        .filter(|character| {
            !matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            )
        })
        .take(32)
        .collect::<String>();

    if sanitized_title.is_empty() || sanitized_title == label {
        format!("{label}.md")
    } else {
        format!("{label} - {sanitized_title}.md")
    }
}

fn text_information_level(content: &str) -> &'static str {
    match content.chars().count() {
        0..=240 => "low",
        241..=700 => "medium",
        _ => "high",
    }
}

fn push_optional_markdown_line(lines: &mut Vec<String>, label: &str, value: Option<&str>) {
    let Some(value) = trimmed_non_empty(value) else {
        return;
    };
    lines.push(format!("- {label}: {value}"));
}

fn push_optional_markdown_lines(lines: &mut Vec<String>, label: &str, values: &[String]) {
    for value in values {
        let Some(value) = trimmed_non_empty(Some(value.as_str())) else {
            continue;
        };
        lines.push(format!("- {label}: {value}"));
    }
}

fn push_optional_section(lines: &mut Vec<String>, title: &str, value: Option<&str>) {
    let Some(value) = trimmed_non_empty(value) else {
        return;
    };
    lines.push(format!("## {title}\n\n{value}"));
}

fn trimmed_non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn onboarding_hypothesis_mode(
    memo: Option<&str>,
    website_urls: &[String],
    sns_urls: &[String],
    product_info: Option<&str>,
) -> bool {
    trimmed_non_empty(memo).is_none()
        && website_urls.is_empty()
        && sns_urls.is_empty()
        && trimmed_non_empty(product_info).is_none()
}

fn onboarding_information_level(
    content: &str,
    website_urls: &[String],
    sns_urls: &[String],
    product_info: Option<&str>,
) -> &'static str {
    let mut score = 0;
    let content_length = content.chars().count();
    if content_length > 220 {
        score += 1;
    }
    if content_length > 700 {
        score += 1;
    }
    score += website_urls.len().min(2);
    score += sns_urls.len().min(3);
    if trimmed_non_empty(product_info).is_some() {
        score += 1;
    }

    match score {
        0 | 1 => "low",
        2 | 3 => "medium",
        _ => "high",
    }
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
    let normalized_description = empty_to_none(description);
    let normalized_memo = empty_to_none(memo);
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
                normalized_description.as_deref(),
                confidence_status,
                impact_score,
                subjective_importance,
                adoption_status,
                normalized_memo.as_deref(),
                now,
                item_id,
                project_id
            ],
        )
        .map_err(|error| error.to_string())?;
    sync_nodes_for_updated_item_in_transaction(
        &transaction,
        &project_id,
        &item_id,
        &name,
        &item_type,
        normalized_description.as_deref(),
        &confidence_status,
        impact_score,
        &adoption_status,
        now.as_str(),
    )?;
    clear_map_analysis_in_transaction(&transaction, &project_id)?;
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

    let purpose_context = load_prompt_purpose_context(&connection, &project_id)?;
    let prompt = map_prompt(&items, &purpose_context);
    let prompt_hash = hash_text(&prompt);
    let ai_result = try_structured_ai(app, &state.db_path, &prompt, map_draft_json_schema());
    let (provider_used, duration_ms) = provider_metadata(&ai_result);
    let (output_json, model, status, error, fallback_used, message) = match ai_result.response_json
    {
        Some(value) => (
            value,
            ai_result.model_label,
            "completed",
            None,
            false,
            "売上マップを生成しました。".to_string(),
        ),
        None => (
            build_map_output(&items),
            LOCAL_MODEL.to_string(),
            "fallback_completed",
            Some(ai_result.errors.join("; ")),
            true,
            "AI実行に失敗したため、ローカルドラフトで売上マップを生成しました。".to_string(),
        ),
    };
    let output = validate_map_draft_json(&output_json)?;
    let ai_run_id = save_ai_run(
        &connection,
        &app_data_dir,
        &project_id,
        "generate_map",
        "MapDraftOutput",
        &model,
        pending_ai_run_status(status),
        json!({
            "mode": "accepted_extracted_items",
            "fallbackUsed": fallback_used,
            "promptHash": prompt_hash,
            "extractedItemCount": items.len(),
            "extractedItemIds": items.iter().map(|item| item.id.clone()).collect::<Vec<_>>(),
            "purpose": purpose_context.request_summary(),
            "generationMode": purpose_context.generation_mode(),
            "providerUsed": provider_used,
            "durationMs": duration_ms,
        }),
        &output_json,
        error,
    )?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    clear_map_outputs_in_transaction(&transaction, &project_id)?;
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
    clear_map_analysis_in_transaction(&transaction, &project_id)?;
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
    clear_map_analysis_in_transaction(&transaction, &project_id)?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_map")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn create_map_edge(
    state: State<'_, DbState>,
    project_id: String,
    source_node_id: String,
    target_node_id: String,
) -> Result<ProjectWorkspace, String> {
    if source_node_id == target_node_id {
        return Err("同じノード同士は接続できません。".to_string());
    }

    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    for node_id in [&source_node_id, &target_node_id] {
        let exists: Option<String> = transaction
            .query_row(
                "SELECT id FROM nodes WHERE id = ?1 AND project_id = ?2",
                params![node_id, project_id.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if exists.is_none() {
            return Err("接続先ノードが見つかりません。".to_string());
        }
    }

    let duplicate: Option<String> = transaction
        .query_row(
            "SELECT id FROM edges
             WHERE project_id = ?1 AND source_node_id = ?2 AND target_node_id = ?3
               AND adoption_status != 'rejected'",
            params![
                project_id.as_str(),
                source_node_id.as_str(),
                target_node_id.as_str()
            ],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if duplicate.is_some() {
        return Err("この導線はすでに存在します。".to_string());
    }

    let edge_id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO edges (
                id, project_id, source_node_id, target_node_id, edge_type, flow_type,
                strength, direction, confidence_status, evidence, note, label,
                adoption_status, priority, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, 'normal', 'inquiry',
                'normal', 'forward', 'estimated', ?5, NULL, '導線',
                'accepted', NULL, ?6, ?6
             )",
            params![
                edge_id,
                project_id.as_str(),
                source_node_id.as_str(),
                target_node_id.as_str(),
                "ユーザーがマップ編集モードで追加した導線です。",
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    clear_map_analysis_in_transaction(&transaction, &project_id)?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_create_map_edge")?;
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
                    map_position_json(&position).to_string(),
                    now,
                    position.node_id,
                    project_id
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn save_view_layout(
    state: State<'_, DbState>,
    project_id: String,
    view_id: String,
    positions: Vec<MapPositionInput>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_allowed_view_id(&view_id)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let layout_json = merged_view_layout_json(&transaction, &project_id, &view_id, &positions)?;

    transaction
        .execute(
            "INSERT INTO view_layouts (
                id, project_id, view_id, layout_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(project_id, view_id) DO UPDATE SET
                layout_json = excluded.layout_json,
                updated_at = excluded.updated_at",
            params![
                Uuid::new_v4().to_string(),
                project_id,
                view_id,
                layout_json,
                now,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

fn merged_view_layout_json(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    view_id: &str,
    positions: &[MapPositionInput],
) -> Result<String, String> {
    let existing_layout: Option<String> = transaction
        .query_row(
            "SELECT layout_json FROM view_layouts WHERE project_id = ?1 AND view_id = ?2",
            params![project_id, view_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let mut merged_positions = existing_layout
        .as_deref()
        .map(parse_layout_position_map)
        .transpose()?
        .unwrap_or_default();

    for position in positions {
        merged_positions.insert(
            position.node_id.clone(),
            MapLayoutValues {
                x: position.x,
                y: position.y,
                width: position.width,
                height: position.height,
            },
        );
    }

    let mut sorted_positions = merged_positions.into_iter().collect::<Vec<_>>();
    sorted_positions.sort_by(|left, right| left.0.cmp(&right.0));

    Ok(json!({
        "viewId": view_id,
        "positions": sorted_positions
            .into_iter()
            .map(|(node_id, values)| map_layout_json(&node_id, values))
            .collect::<Vec<_>>(),
    })
    .to_string())
}

fn map_position_json(position: &MapPositionInput) -> Value {
    map_layout_json(
        &position.node_id,
        MapLayoutValues {
            x: position.x,
            y: position.y,
            width: position.width,
            height: position.height,
        },
    )
}

fn map_layout_json(node_id: &str, values: MapLayoutValues) -> Value {
    let mut value = json!({
        "nodeId": node_id,
        "x": values.x,
        "y": values.y,
    });
    if let Some(width) = values.width {
        value["width"] = json!(width);
    }
    if let Some(height) = values.height {
        value["height"] = json!(height);
    }
    value
}

fn parse_layout_position_map(value: &str) -> Result<HashMap<String, MapLayoutValues>, String> {
    let parsed: Value = serde_json::from_str(value).map_err(|error| error.to_string())?;
    let Some(positions) = parsed.get("positions").and_then(Value::as_array) else {
        return Ok(HashMap::new());
    };

    let mut result = HashMap::new();
    for position in positions {
        let Some(node_id) = position.get("nodeId").and_then(Value::as_str) else {
            continue;
        };
        let Some(x) = position.get("x").and_then(Value::as_f64) else {
            continue;
        };
        let Some(y) = position.get("y").and_then(Value::as_f64) else {
            continue;
        };
        result.insert(
            node_id.to_string(),
            MapLayoutValues {
                x,
                y,
                width: position.get("width").and_then(Value::as_f64),
                height: position.get("height").and_then(Value::as_f64),
            },
        );
    }

    Ok(result)
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

    let (active_nodes, active_edges) = active_map_scope(&workspace);

    if active_nodes.is_empty() {
        return Err("売上マップがありません。先にマップを生成してください。".to_string());
    }

    let purpose_context = prompt_purpose_context_from_workspace(&workspace);
    let prompt = analysis_prompt(&workspace, &purpose_context);
    let suggestions_prompt = business_impact_prompt(&workspace, &purpose_context);
    let prompt_hash = hash_text(&prompt);
    let suggestions_prompt_hash = hash_text(&suggestions_prompt);
    let analysis_result = try_structured_ai(
        app.clone(),
        &state.db_path,
        &prompt,
        ai_analysis_json_schema(),
    );
    let suggestions_result = try_structured_ai(
        app,
        &state.db_path,
        &suggestions_prompt,
        suggestion_cards_json_schema(),
    );
    let (analysis_provider_used, analysis_duration_ms) = provider_metadata(&analysis_result);
    let (suggestions_provider_used, suggestions_duration_ms) =
        provider_metadata(&suggestions_result);
    let (analysis_json, analysis_model, analysis_status, analysis_error, analysis_fallback_used) =
        match analysis_result.response_json {
            Some(value) => (value, analysis_result.model_label, "completed", None, false),
            None => (
                build_analysis_output(&workspace),
                LOCAL_MODEL.to_string(),
                "fallback_completed",
                Some(analysis_result.errors.join("; ")),
                true,
            ),
        };
    let (
        suggestions_json,
        suggestions_model,
        suggestions_status,
        suggestions_error,
        suggestions_fallback_used,
    ) = match suggestions_result.response_json {
        Some(value) => (
            value,
            suggestions_result.model_label,
            "completed",
            None,
            false,
        ),
        None => (
            build_suggestions_output(&workspace),
            LOCAL_MODEL.to_string(),
            "fallback_completed",
            Some(suggestions_result.errors.join("; ")),
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
        &analysis_model,
        pending_ai_run_status(analysis_status),
        json!({
            "mode": "map_summary",
            "fallbackUsed": analysis_fallback_used,
            "promptHash": prompt_hash.clone(),
            "nodeCount": active_nodes.len(),
            "edgeCount": active_edges.len(),
            "purpose": purpose_context.request_summary(),
            "generationMode": purpose_context.generation_mode(),
            "providerUsed": analysis_provider_used,
            "durationMs": analysis_duration_ms,
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
        &suggestions_model,
        pending_ai_run_status(suggestions_status),
        json!({
            "mode": "map_summary",
            "fallbackUsed": suggestions_fallback_used,
            "promptHash": suggestions_prompt_hash,
            "nodeCount": active_nodes.len(),
            "edgeCount": active_edges.len(),
            "view": "business_impact",
            "purpose": purpose_context.request_summary(),
            "generationMode": purpose_context.generation_mode(),
            "providerUsed": suggestions_provider_used,
            "durationMs": suggestions_duration_ms,
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
            "DELETE FROM ai_comments
             WHERE project_id = ?1
               AND comment_type IN ('summary', 'strong_flow', 'bottleneck', 'unconnected', 'question')",
            [project_id.as_str()],
        )
        .map_err(|error| error.to_string())?;
    insert_ai_comments(&transaction, &project_id, &analysis_run_id, &analysis)?;
    insert_ai_question_action_items(&transaction, &project_id, &analysis_run_id, &analysis)?;
    insert_suggestions(
        &transaction,
        &project_id,
        &suggestions_run_id,
        &suggestions,
        &workspace,
    )?;
    finalize_ai_run_in_transaction(&transaction, &analysis_run_id, analysis_status)?;
    finalize_ai_run_in_transaction(&transaction, &suggestions_run_id, suggestions_status)?;
    record_snapshot_in_transaction(&transaction, &project_id, "ai_generate_suggestions")?;
    transaction.commit().map_err(|error| error.to_string())?;

    let message = if analysis_fallback_used || suggestions_fallback_used {
        "AI実行に失敗した一部出力をローカルドラフトで補完しました。".to_string()
    } else {
        "AIコメントと次に試す一手を生成しました。".to_string()
    };

    Ok(MvpRunResult {
        ok: true,
        ai_run_id: Some(suggestions_run_id),
        message,
        workspace: load_workspace(&connection, &project_id)?,
    })
}

#[tauri::command]
pub fn ask_map_insight(
    app: AppHandle,
    state: State<'_, DbState>,
    project_id: String,
    target_kind: String,
    target_id: Option<String>,
    question_type: String,
) -> Result<MvpRunResult, String> {
    let app_data_dir = app_data_dir_from_db(&state.db_path)?.to_path_buf();
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_allowed_input("target_kind", &target_kind, &["map", "node", "edge"])?;
    ensure_allowed_input(
        "question_type",
        &question_type,
        &[
            "explain",
            "importance",
            "bottleneck",
            "next_questions",
            "revenue_action",
        ],
    )?;
    let workspace = load_workspace(&connection, &project_id)?;
    let (active_nodes, _) = active_map_scope(&workspace);
    if active_nodes.is_empty() {
        return Err("売上マップがありません。先にマップを生成してください。".to_string());
    }

    let purpose_context = prompt_purpose_context_from_workspace(&workspace);
    let prompt = map_insight_prompt(
        &workspace,
        &target_kind,
        target_id.as_deref(),
        &question_type,
        &purpose_context,
    )?;
    let prompt_hash = hash_text(&prompt);
    let ai_result = try_structured_ai(app, &state.db_path, &prompt, map_insight_json_schema());
    let (provider_used, duration_ms) = provider_metadata(&ai_result);
    let (output_json, model, status, error, fallback_used, message) = match ai_result.response_json
    {
        Some(value) => (
            value,
            ai_result.model_label,
            "completed",
            None,
            false,
            "理解メモを生成しました。".to_string(),
        ),
        None => (
            build_map_insight_output(
                &workspace,
                &target_kind,
                target_id.as_deref(),
                &question_type,
            ),
            LOCAL_MODEL.to_string(),
            "fallback_completed",
            Some(ai_result.errors.join("; ")),
            true,
            "AI実行に失敗したため、ローカルドラフトで理解メモを生成しました。".to_string(),
        ),
    };
    let output = validate_map_insight_json(&output_json)?;
    let validated_output_json = serde_json::to_value(&output).map_err(|error| error.to_string())?;
    let ai_run_id = save_ai_run(
        &connection,
        &app_data_dir,
        &project_id,
        "ask_map_insight",
        "MapInsightOutput",
        &model,
        pending_ai_run_status(status),
        json!({
            "mode": "map_context_question",
            "fallbackUsed": fallback_used,
            "promptHash": prompt_hash,
            "targetKind": target_kind.as_str(),
            "targetId": target_id.as_deref(),
            "questionType": question_type.as_str(),
            "purpose": purpose_context.request_summary(),
            "generationMode": purpose_context.generation_mode(),
            "providerUsed": provider_used,
            "durationMs": duration_ms,
        }),
        &validated_output_json,
        error,
    )?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    insert_map_insight_comment(
        &transaction,
        &project_id,
        &ai_run_id,
        &output,
        &target_kind,
        target_id.as_deref(),
        &question_type,
    )?;
    finalize_ai_run_in_transaction(&transaction, &ai_run_id, status)?;
    record_snapshot_in_transaction(&transaction, &project_id, "ai_map_insight")?;
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
pub fn update_suggestion(
    state: State<'_, DbState>,
    project_id: String,
    suggestion_id: String,
    title: String,
    description: String,
    priority: String,
    adoption_status: String,
    rationale: Option<String>,
    expected_revenue_impact: String,
    expected_profit_impact: String,
    cost_level: String,
    effort_level: String,
    time_to_impact: String,
    confidence_status: String,
    impact_score: i64,
    evidence: Option<String>,
    memo: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_non_empty_input("title", &title)?;
    ensure_non_empty_input("description", &description)?;
    ensure_allowed_input("priority", &priority, &["high", "medium", "low"])?;
    ensure_allowed_input(
        "adoption_status",
        &adoption_status,
        &["accepted", "pending", "rejected"],
    )?;
    ensure_allowed_input(
        "expected_revenue_impact",
        &expected_revenue_impact,
        &["high", "medium", "low", "unknown"],
    )?;
    ensure_allowed_input(
        "expected_profit_impact",
        &expected_profit_impact,
        &["high", "medium", "low", "unknown"],
    )?;
    ensure_allowed_input(
        "cost_level",
        &cost_level,
        &["low", "medium", "high", "unknown"],
    )?;
    ensure_allowed_input(
        "effort_level",
        &effort_level,
        &["low", "medium", "high", "unknown"],
    )?;
    ensure_allowed_input(
        "time_to_impact",
        &time_to_impact,
        &["short", "mid", "long", "unknown"],
    )?;
    ensure_allowed_input(
        "confidence_status",
        &confidence_status,
        &["confirmed", "estimated", "needs_review"],
    )?;
    ensure_score_input("impact_score", impact_score, 0, 100)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    let updated_count = transaction
        .execute(
            "UPDATE suggestions
             SET title = ?1,
                 description = ?2,
                 priority = ?3,
                 adoption_status = ?4,
                 rationale = ?5,
                 expected_revenue_impact = ?6,
                 expected_profit_impact = ?7,
                 cost_level = ?8,
                 effort_level = ?9,
                 time_to_impact = ?10,
                 confidence_status = ?11,
                 impact_score = ?12,
                 evidence = ?13,
                 memo = ?14,
                 updated_at = ?15
             WHERE id = ?16 AND project_id = ?17",
            params![
                title,
                description,
                priority,
                adoption_status,
                empty_to_none(rationale),
                expected_revenue_impact,
                expected_profit_impact,
                cost_level,
                effort_level,
                time_to_impact,
                confidence_status,
                impact_score.clamp(0, 100),
                empty_to_none(evidence),
                empty_to_none(memo),
                now,
                suggestion_id,
                project_id
            ],
        )
        .map_err(|error| error.to_string())?;

    if updated_count == 0 {
        return Err("Suggestion was not found.".to_string());
    }

    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_business_impact")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn create_action_item(
    state: State<'_, DbState>,
    project_id: String,
    title: String,
    body: String,
    priority: String,
    memo: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_non_empty_input("title", &title)?;
    ensure_non_empty_input("body", &body)?;
    ensure_allowed_input("priority", &priority, &["low", "medium", "high"])?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "INSERT INTO action_items (
                id, project_id, source_type, title, body, status, priority, memo, created_at, updated_at
             ) VALUES (?1, ?2, 'manual', ?3, ?4, 'open', ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                project_id.as_str(),
                title.trim(),
                body.trim(),
                priority.as_str(),
                empty_to_none(memo),
                now.as_str(),
                now.as_str()
            ],
        )
        .map_err(|error| error.to_string())?;

    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_records")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn create_action_item_from_suggestion(
    state: State<'_, DbState>,
    project_id: String,
    suggestion_id: String,
) -> Result<ProjectWorkspace, String> {
    create_action_item_from_suggestion_inner(&state.db_path, project_id, suggestion_id)
}

fn create_action_item_from_suggestion_inner(
    db_path: &PathBuf,
    project_id: String,
    suggestion_id: String,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let suggestion = transaction
        .query_row(
            "SELECT id, title, description, priority, rationale, evidence
             FROM suggestions
             WHERE project_id = ?1 AND id = ?2",
            params![project_id.as_str(), suggestion_id.as_str()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((source_id, title, description, priority, rationale, evidence)) = suggestion else {
        return Err("Suggestion was not found.".to_string());
    };
    let title = title.trim();
    let description = description.trim();

    let existing_id: Option<String> = transaction
        .query_row(
            "SELECT id
             FROM action_items
             WHERE project_id = ?1
               AND source_type = 'suggestion'
               AND status = 'open'
               AND (
                    source_id = ?2
                    OR (TRIM(title) = ?3 AND TRIM(body) = ?4)
               )
             LIMIT 1",
            params![project_id.as_str(), source_id.as_str(), title, description],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if existing_id.is_some() {
        transaction.commit().map_err(|error| error.to_string())?;
        return load_workspace(&connection, &project_id);
    }

    let now = now_rfc3339()?;
    let memo = rationale.or(evidence);
    transaction
        .execute(
            "INSERT INTO action_items (
                id, project_id, source_type, source_id, title, body, status, priority, memo, created_at, updated_at
             ) VALUES (?1, ?2, 'suggestion', ?3, ?4, ?5, 'open', ?6, ?7, ?8, ?9)",
            params![
                Uuid::new_v4().to_string(),
                project_id.as_str(),
                source_id.as_str(),
                title,
                description,
                priority.as_str(),
                memo.as_deref(),
                now.as_str(),
                now.as_str()
            ],
        )
        .map_err(|error| error.to_string())?;
    record_snapshot_in_transaction(&transaction, &project_id, "human_promote_suggestion")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_action_item(
    state: State<'_, DbState>,
    project_id: String,
    action_item_id: String,
    title: String,
    body: String,
    status: String,
    priority: String,
    memo: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_non_empty_input("title", &title)?;
    ensure_non_empty_input("body", &body)?;
    ensure_allowed_action_status(&status)?;
    ensure_allowed_input("priority", &priority, &["low", "medium", "high"])?;
    let now = now_rfc3339()?;
    let completed_at = if status == "done" {
        Some(now.clone())
    } else {
        None
    };
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let updated_count = transaction
        .execute(
            "UPDATE action_items
             SET title = ?1, body = ?2, status = ?3, priority = ?4, memo = ?5,
                 updated_at = ?6, completed_at = ?7
             WHERE id = ?8 AND project_id = ?9",
            params![
                title.trim(),
                body.trim(),
                status.as_str(),
                priority.as_str(),
                empty_to_none(memo),
                now.as_str(),
                completed_at.as_deref(),
                action_item_id.as_str(),
                project_id.as_str()
            ],
        )
        .map_err(|error| error.to_string())?;

    if updated_count == 0 {
        return Err("Action item was not found.".to_string());
    }

    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_records")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn create_map_note(
    state: State<'_, DbState>,
    project_id: String,
    title: String,
    body: String,
    note_type: String,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_non_empty_input("title", &title)?;
    ensure_non_empty_input("body", &body)?;
    ensure_allowed_note_type(&note_type)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute(
            "INSERT INTO map_notes (id, project_id, title, body, note_type, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                project_id.as_str(),
                title.trim(),
                body.trim(),
                note_type.as_str(),
                now.as_str(),
                now.as_str()
            ],
        )
        .map_err(|error| error.to_string())?;

    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_records")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn update_map_note(
    state: State<'_, DbState>,
    project_id: String,
    note_id: String,
    title: String,
    body: String,
    note_type: String,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_non_empty_input("title", &title)?;
    ensure_non_empty_input("body", &body)?;
    ensure_allowed_note_type(&note_type)?;
    let now = now_rfc3339()?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let updated_count = transaction
        .execute(
            "UPDATE map_notes
             SET title = ?1, body = ?2, note_type = ?3, updated_at = ?4
             WHERE id = ?5 AND project_id = ?6",
            params![
                title.trim(),
                body.trim(),
                note_type.as_str(),
                now.as_str(),
                note_id.as_str(),
                project_id.as_str()
            ],
        )
        .map_err(|error| error.to_string())?;

    if updated_count == 0 {
        return Err("Map note was not found.".to_string());
    }

    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_records")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn delete_map_note(
    state: State<'_, DbState>,
    project_id: String,
    note_id: String,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let deleted_count = transaction
        .execute(
            "DELETE FROM map_notes WHERE id = ?1 AND project_id = ?2",
            params![note_id.as_str(), project_id.as_str()],
        )
        .map_err(|error| error.to_string())?;

    if deleted_count == 0 {
        return Err("Map note was not found.".to_string());
    }

    record_snapshot_in_transaction(&transaction, &project_id, "human_edit_records")?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
}

#[tauri::command]
pub fn create_named_version(
    state: State<'_, DbState>,
    project_id: String,
    name: String,
    memo: Option<String>,
) -> Result<ProjectWorkspace, String> {
    let mut connection = open_connection(&state.db_path)?;
    ensure_project_exists(&connection, &project_id)?;
    ensure_non_empty_input("name", &name)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let memo = empty_to_none(memo);
    record_snapshot_with_metadata_in_transaction(
        &transaction,
        &project_id,
        "named",
        Some(name.trim()),
        memo.as_deref(),
    )?;
    transaction.commit().map_err(|error| error.to_string())?;

    load_workspace(&connection, &project_id)
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
    let markdown = render_markdown(&project_name, &workspace);
    let export_target = resolve_export_target(&state.db_path, &app_data_dir, &project_id)?;
    let file_name = format!("synergy-map-{}.md", timestamp_for_file(&now));
    let (path, write_warning) = write_export_with_fallback(&export_target, &file_name, |path| {
        fs::write(path, &markdown).map_err(|error| error.to_string())
    })?;
    let job = insert_export_job(&connection, &project_id, "markdown", &path, &now)?;
    let warning = combine_warnings(export_target.warning, write_warning);

    Ok(ExportResult {
        ok: true,
        export_job: job,
        warning,
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
    let export_target = resolve_export_target(&state.db_path, &app_data_dir, &project_id)?;
    let folder_name = format!("csv-{}", timestamp_for_file(&now));
    let (dir, write_warning) = write_export_with_fallback(&export_target, &folder_name, |dir| {
        write_csv_bundle(dir, &workspace)
    })?;
    let job = insert_export_job(&connection, &project_id, "csv", &dir, &now)?;
    let warning = combine_warnings(export_target.warning, write_warning);

    Ok(ExportResult {
        ok: true,
        export_job: job,
        warning,
        workspace: load_workspace(&connection, &project_id)?,
    })
}

#[derive(Debug)]
struct ExportTarget {
    primary_dir: PathBuf,
    fallback_dir: PathBuf,
    warning: Option<String>,
    used_configured_dir: bool,
}

fn resolve_export_target(
    db_path: &Path,
    app_data_dir: &Path,
    project_id: &str,
) -> Result<ExportTarget, String> {
    let fallback_dir = exports_dir(app_data_dir, project_id);
    let settings = load_ai_settings(db_path);

    if let Some(raw_dir) = settings.default_export_dir {
        let trimmed_dir = raw_dir.trim();
        if !trimmed_dir.is_empty() {
            let configured_dir = PathBuf::from(trimmed_dir);
            if configured_dir.is_absolute() {
                match ensure_writable_export_dir(&configured_dir) {
                    Ok(()) => {
                        return Ok(ExportTarget {
                            primary_dir: configured_dir,
                            fallback_dir,
                            warning: None,
                            used_configured_dir: true,
                        });
                    }
                    Err(error) => {
                        ensure_writable_export_dir(&fallback_dir)?;
                        return Ok(ExportTarget {
                            primary_dir: fallback_dir.clone(),
                            fallback_dir,
                            warning: Some(format!(
                                "設定済み出力フォルダを使えなかったため、アプリ内exportsへ保存しました: {error}"
                            )),
                            used_configured_dir: false,
                        });
                    }
                }
            }

            ensure_writable_export_dir(&fallback_dir)?;
            return Ok(ExportTarget {
                primary_dir: fallback_dir.clone(),
                fallback_dir,
                warning: Some(
                    "設定済み出力フォルダが絶対パスではないため、アプリ内exportsへ保存しました。"
                        .to_string(),
                ),
                used_configured_dir: false,
            });
        }
    }

    ensure_writable_export_dir(&fallback_dir)?;
    Ok(ExportTarget {
        primary_dir: fallback_dir.clone(),
        fallback_dir,
        warning: None,
        used_configured_dir: false,
    })
}

fn ensure_writable_export_dir(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let probe_path = directory.join(format!(".synergy-map-write-test-{}", Uuid::new_v4()));
    fs::write(&probe_path, b"ok").map_err(|error| error.to_string())?;
    fs::remove_file(probe_path).map_err(|error| error.to_string())
}

fn write_export_with_fallback<F>(
    target: &ExportTarget,
    output_name: &str,
    writer: F,
) -> Result<(PathBuf, Option<String>), String>
where
    F: Fn(&Path) -> Result<(), String>,
{
    let primary_path = target.primary_dir.join(output_name);
    match writer(&primary_path) {
        Ok(()) => Ok((primary_path, None)),
        Err(error) if target.used_configured_dir => {
            cleanup_failed_export_path(&primary_path);
            ensure_writable_export_dir(&target.fallback_dir)?;
            let fallback_path = target.fallback_dir.join(output_name);
            writer(&fallback_path).map_err(|fallback_error| {
                format!(
                    "設定済み出力先とアプリ内exportsのどちらにも保存できませんでした: {error}; fallback: {fallback_error}"
                )
            })?;
            Ok((
                fallback_path,
                Some(format!(
                    "設定済み出力先へ保存できなかったため、アプリ内exportsへ保存しました: {error}"
                )),
            ))
        }
        Err(error) => Err(error),
    }
}

fn cleanup_failed_export_path(path: &Path) {
    if path.is_dir() {
        let _ = fs::remove_dir_all(path);
    } else if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn combine_warnings(first: Option<String>, second: Option<String>) -> Option<String> {
    match (first, second) {
        (Some(first), Some(second)) => Some(format!("{first} / {second}")),
        (Some(first), None) => Some(first),
        (None, Some(second)) => Some(second),
        (None, None) => None,
    }
}

fn write_csv_bundle(dir: &Path, workspace: &ProjectWorkspace) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let nodes = exportable_nodes(&workspace.nodes);
    let node_ids = nodes
        .iter()
        .map(|node| node.id.clone())
        .collect::<HashSet<_>>();
    let edges = exportable_edges(&workspace.edges, &node_ids);
    let suggestions = exportable_suggestions(&workspace.suggestions);
    write_nodes_csv(&dir.join("nodes.csv"), &nodes)?;
    write_edges_csv(&dir.join("edges.csv"), &edges)?;
    write_suggestions_csv(&dir.join("suggestions.csv"), &suggestions)?;
    write_sources_csv(&dir.join("sources.csv"), &workspace.source_files)?;
    write_action_items_csv(&dir.join("action_items.csv"), &workspace.action_items)?;
    write_map_notes_csv(&dir.join("map_notes.csv"), &workspace.map_notes)
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

fn ensure_allowed_view_id(view_id: &str) -> Result<(), String> {
    if matches!(view_id, "customer_journey" | "business_impact") {
        Ok(())
    } else {
        Err(format!("Unsupported view_id: {view_id}"))
    }
}

fn ensure_non_empty_input(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required."))
    } else {
        Ok(())
    }
}

fn ensure_allowed_input(field: &str, value: &str, allowed: &[&str]) -> Result<(), String> {
    if allowed.iter().any(|allowed_value| allowed_value == &value) {
        Ok(())
    } else {
        Err(format!("{field} has unsupported value: {value}"))
    }
}

fn ensure_allowed_action_status(value: &str) -> Result<(), String> {
    ensure_allowed_input("status", value, &["open", "done", "dismissed"])
}

fn ensure_allowed_note_type(value: &str) -> Result<(), String> {
    ensure_allowed_input("note_type", value, &["thought", "meeting", "daily"])
}

fn ensure_score_input(field: &str, value: i64, min: i64, max: i64) -> Result<(), String> {
    if (min..=max).contains(&value) {
        Ok(())
    } else {
        Err(format!("{field} must be between {min} and {max}."))
    }
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
        view_layouts: load_view_layouts(connection, project_id)?,
        action_items: load_action_items(connection, project_id)?,
        map_notes: load_map_notes(connection, project_id)?,
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
                    adoption_status, rationale, related_node_ids_json,
                    expected_revenue_impact, expected_profit_impact, cost_level,
                    effort_level, time_to_impact, confidence_status, impact_score,
                    evidence, memo, created_at, updated_at
             FROM suggestions
             WHERE project_id = ?1
             ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                      impact_score DESC,
                      created_at DESC",
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
                expected_revenue_impact: row.get(9)?,
                expected_profit_impact: row.get(10)?,
                cost_level: row.get(11)?,
                effort_level: row.get(12)?,
                time_to_impact: row.get(13)?,
                confidence_status: row.get(14)?,
                impact_score: row.get(15)?,
                evidence: row.get(16)?,
                memo: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_view_layouts(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ViewLayoutRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, view_id, layout_json, created_at, updated_at
             FROM view_layouts
             WHERE project_id = ?1
             ORDER BY view_id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(ViewLayoutRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                view_id: row.get(2)?,
                layout_json: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
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
            "SELECT id, project_id, version_type, name, memo, snapshot_json, created_at
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
                name: row.get(3)?,
                memo: row.get(4)?,
                snapshot_json: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_action_items(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ActionItemRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, ai_run_id, source_type, source_id, title, body,
                    status, priority, memo, created_at, updated_at, completed_at
             FROM action_items
             WHERE project_id = ?1
             ORDER BY
               CASE status WHEN 'open' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
               CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(ActionItemRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                ai_run_id: row.get(2)?,
                source_type: row.get(3)?,
                source_id: row.get(4)?,
                title: row.get(5)?,
                body: row.get(6)?,
                status: row.get(7)?,
                priority: row.get(8)?,
                memo: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                completed_at: row.get(12)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_map_notes(connection: &Connection, project_id: &str) -> Result<Vec<MapNoteRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, title, body, note_type, created_at, updated_at
             FROM map_notes
             WHERE project_id = ?1
             ORDER BY updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(MapNoteRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                note_type: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
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
    metadata_json: String,
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

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct PromptPurposeContext {
    purpose_id: Option<String>,
    purpose_label: Option<String>,
    information_level: Option<String>,
    hypothesis_mode: bool,
}

impl PromptPurposeContext {
    fn generation_mode(&self) -> &'static str {
        if self.hypothesis_mode {
            "hypothesis_map"
        } else if self.purpose_label.is_some() {
            "purpose_guided"
        } else {
            "standard"
        }
    }

    fn request_summary(&self) -> Value {
        json!({
            "purposeId": self.purpose_id,
            "purposeLabel": self.purpose_label,
            "informationLevel": self.information_level,
            "hypothesisMode": self.hypothesis_mode,
            "generationMode": self.generation_mode(),
        })
    }

    fn prompt_block(&self) -> String {
        let purpose_id = self.purpose_id.as_deref().unwrap_or("unspecified");
        let purpose_label = self.purpose_label.as_deref().unwrap_or("未指定");
        let information_level = self.information_level.as_deref().unwrap_or("unknown");
        let confidence_instruction = if self.hypothesis_mode {
            "情報が少ない仮説マップとして扱い、断定を避け、confirmedよりestimated/needs_reviewを優先する。"
        } else {
            "目的に関係する材料を優先しつつ、根拠が薄い箇所はestimated/needs_reviewにする。"
        };

        format!(
            "PurposeContext:\n- purposeId: {purpose_id}\n- purposeLabel: {purpose_label}\n- generationMode: {}\n- informationLevel: {information_level}\n- instruction: {confidence_instruction}",
            self.generation_mode()
        )
    }
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
            "SELECT sc.id, sc.source_file_id, sf.file_name, sf.file_type, sf.metadata_json, sc.content_path
             FROM source_chunks sc
             JOIN source_files sf ON sf.id = sc.source_file_id
             WHERE sc.project_id = ?1
             ORDER BY sf.created_at DESC, sc.chunk_index ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project_id], |row| {
            let content_path: String = row.get(5)?;
            Ok(ExtractionChunk {
                id: row.get(0)?,
                source_file_id: row.get(1)?,
                file_name: row.get(2)?,
                file_type: row.get(3)?,
                metadata_json: row.get(4)?,
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

fn prompt_purpose_context_from_chunks(chunks: &[ExtractionChunk]) -> PromptPurposeContext {
    chunks
        .iter()
        .find_map(|chunk| prompt_purpose_context_from_metadata(&chunk.metadata_json))
        .unwrap_or_default()
}

fn prompt_purpose_context_from_workspace(workspace: &ProjectWorkspace) -> PromptPurposeContext {
    workspace
        .source_files
        .iter()
        .find_map(|source| prompt_purpose_context_from_metadata(&source.metadata_json))
        .unwrap_or_default()
}

fn load_prompt_purpose_context(
    connection: &Connection,
    project_id: &str,
) -> Result<PromptPurposeContext, String> {
    let metadata_json: Option<String> = connection
        .query_row(
            "SELECT metadata_json
             FROM source_files
             WHERE project_id = ?1
               AND file_type = 'onboarding_brief'
             ORDER BY created_at DESC
             LIMIT 1",
            [project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some(context) =
        metadata_json.and_then(|metadata| prompt_purpose_context_from_metadata(&metadata))
    {
        return Ok(context);
    }

    let project_purpose: Option<String> = connection
        .query_row(
            "SELECT description FROM projects WHERE id = ?1 AND archived_at IS NULL",
            [project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .flatten();

    Ok(project_purpose
        .and_then(|label| {
            trimmed_owned(label).map(|purpose_label| PromptPurposeContext {
                purpose_id: None,
                purpose_label: Some(purpose_label),
                information_level: None,
                hypothesis_mode: false,
            })
        })
        .unwrap_or_default())
}

fn prompt_purpose_context_from_metadata(metadata_json: &str) -> Option<PromptPurposeContext> {
    let parsed: Value = serde_json::from_str(metadata_json).ok()?;
    let purpose_label = json_string(&parsed, "purposeLabel");
    if purpose_label.is_none() {
        return None;
    }

    Some(PromptPurposeContext {
        purpose_id: json_string(&parsed, "purposeId"),
        purpose_label,
        information_level: json_string(&parsed, "informationLevel"),
        hypothesis_mode: parsed
            .get("hypothesisMode")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .and_then(|text| trimmed_owned(text.to_string()))
}

fn trimmed_owned(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn build_extracted_items_output(chunks: &[ExtractionChunk]) -> Value {
    let mut grouped = HashMap::<String, Vec<&ExtractionChunk>>::new();
    for chunk in chunks {
        grouped
            .entry(chunk.source_file_id.clone())
            .or_default()
            .push(chunk);
    }

    let mut grouped_chunks = grouped.into_values().collect::<Vec<_>>();
    grouped_chunks.sort_by(|left, right| {
        left[0]
            .source_file_id
            .cmp(&right[0].source_file_id)
            .then_with(|| left[0].file_name.cmp(&right[0].file_name))
    });

    let mut items = Vec::new();
    for (item_index, source_chunks) in grouped_chunks.iter().take(12).enumerate() {
        let first = source_chunks[0];
        let merged = source_chunks
            .iter()
            .take(4)
            .map(|chunk| chunk.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        let item_type = infer_item_type(&merged, &first.file_name, &first.file_type);
        let name = inferred_item_name(&item_type, item_index + 1);
        let sources = source_chunks
            .iter()
            .take(3)
            .map(|chunk| {
                json!({
                    "sourceChunkId": chunk.id,
                    "sourceFileId": chunk.source_file_id,
                    "quote": local_summary_only_quote(),
                })
            })
            .collect::<Vec<_>>();

        items.push(json!({
            "name": name,
            "itemType": item_type,
            "description": inferred_description(&item_type, source_chunks),
            "confidenceStatus": inferred_confidence_status(&merged, &first.file_type),
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
                    "description": "情報ソースから確認した既存事業の中心要素です。",
                    "confidenceStatus": "needs_review",
                    "impactScore": 2,
                    "subjectiveImportance": 2,
                    "memo": null,
                    "sources": [{
                        "sourceChunkId": first.id,
                        "sourceFileId": first.source_file_id,
                        "quote": local_summary_only_quote(),
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

fn extraction_prompt(chunks: &[ExtractionChunk], purpose_context: &PromptPurposeContext) -> String {
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
        "MVP-1の売上マップ用に、以下のsource chunks要約から抽出カードを生成してください。\
         事業、商品・サービス、集客チャネル、顧客接点、財務参考情報、データ資料に分類し、\
         PurposeContextの目的に関係する要素を優先して抽出してください。\
         confidenceStatusはconfirmed/estimated/needs_review、itemTypeはbusiness/service/channel/touchpoint/finance/data_sourceを使ってください。\
         fileTypeがonboarding_briefで情報量が少ない場合は、推測を含むためconfirmedにせずestimatedまたはneeds_reviewを優先してください。\
         sourcesには根拠にしたsourceChunkId/sourceFileIdを入れ、quoteには原文引用ではなく「ローカル要約のみ」と分かる短い説明を入れてください。schemaVersionは{}です。\n\n{}\n\nSource chunks:\n{}",
        SCHEMA_VERSION,
        purpose_context.prompt_block(),
        summaries
    )
}

fn summarize_chunk_for_ai(chunk: &ExtractionChunk) -> String {
    if matches!(
        chunk.file_type.as_str(),
        "onboarding_brief" | "manual_note" | "website_url" | "sns_url" | "product_info"
    ) {
        return summarize_user_entered_source_for_ai(chunk);
    }

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

fn summarize_user_entered_source_for_ai(chunk: &ExtractionChunk) -> String {
    let category = infer_item_type(&chunk.content, &chunk.file_name, &chunk.file_type);
    let mut facts = chunk
        .content
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with('#')
                && !line.contains("利用上の注意")
                && !line.contains("この情報ソースは")
        })
        .map(|line| {
            line.trim_start_matches("- ")
                .replace("## ", "")
                .trim()
                .to_string()
        })
        .filter(|line| !line.is_empty())
        .take(10)
        .collect::<Vec<_>>();

    if facts.is_empty() {
        facts.push(truncate_chars(&chunk.content.replace('\n', " "), 420));
    }

    let summary = truncate_chars(&facts.join(" / "), 720);
    format!(
        "推定分類: {category}。ユーザー入力要約: {summary}。情報種別: {}。",
        chunk.file_type
    )
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

fn item_type_label(item_type: &str) -> &'static str {
    match item_type {
        "business" => "事業",
        "service" => "商品・サービス",
        "channel" => "集客チャネル",
        "touchpoint" => "顧客接点",
        "finance" => "財務参考情報",
        "data_source" => "データ資料",
        _ => "抽出項目",
    }
}

fn inferred_confidence_status(content: &str, file_type: &str) -> &'static str {
    if file_type == "onboarding_brief" && content.chars().count() < 420 {
        "needs_review"
    } else if content.chars().count() > 120 {
        "estimated"
    } else {
        "needs_review"
    }
}

fn local_summary_only_quote() -> &'static str {
    "原文引用は保存していません。ローカル要約と出典IDのみを利用しています。"
}

fn inferred_item_name(item_type: &str, index: usize) -> String {
    format!("{}候補 {}", item_type_label(item_type), index)
}

fn inferred_description(item_type: &str, chunks: &[&ExtractionChunk]) -> String {
    let summaries = chunks
        .iter()
        .take(2)
        .map(|chunk| summarize_chunk_for_ai(chunk))
        .collect::<Vec<_>>()
        .join(" ");
    let label = item_type_label(item_type);

    if summaries.is_empty() {
        format!("{label}としてローカル要約から抽出した確認対象です。")
    } else {
        truncate_chars(
            &format!("{label}としてローカル要約から抽出した確認対象です。{summaries}"),
            220,
        )
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
        .filter(|item| item.adoption_status == "accepted")
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

fn map_prompt(items: &[MapItem], purpose_context: &PromptPurposeContext) -> String {
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
        "MVP-1の顧客導線ビューとして、抽出カードから1枚の売上マップを生成してください。\
         配置は中心事業を中央に置き、集客チャネルとデータ資料を左、顧客接点を右、商品・サービスをさらに右へ置くhub-and-flow型を優先してください。\
         同じ分類のノードは縦に重ならないように並べ、中心事業との関係が読める余白を残してください。\
         PurposeContextの目的に合う配置と導線を優先し、目的に関係しない要素は補助ノードとして扱ってください。\
         nodesは読みやすい2D座標で配置し、edgesはawareness/inquiry/proposal/purchase/retention/referral/data_referenceから選んでください。\
         nodeTypeはbusiness/service/channel/touchpoint/finance/data_source、schemaVersionは{}です。\n\n{}\n\nExtracted items:\n{}",
        SCHEMA_VERSION,
        purpose_context.prompt_block(),
        summaries
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

fn structured_map_positions(output: &crate::ai_schema::MapDraftOutput) -> Vec<(f64, f64)> {
    let core_index = central_node_index(output);
    let mut counters = HashMap::<&str, usize>::new();

    output
        .nodes
        .iter()
        .enumerate()
        .map(|(index, node)| {
            if index == core_index {
                return (520.0, 300.0);
            }

            let count = counters.entry(node.node_type.as_str()).or_default();
            let position = peripheral_position(node.node_type.as_str(), *count);
            *count += 1;
            position
        })
        .collect()
}

fn central_node_index(output: &crate::ai_schema::MapDraftOutput) -> usize {
    let mut degrees = HashMap::<&str, i64>::new();
    for edge in &output.edges {
        *degrees.entry(edge.source_node_label.as_str()).or_default() += 1;
        *degrees.entry(edge.target_node_label.as_str()).or_default() += 1;
    }

    output
        .nodes
        .iter()
        .enumerate()
        .max_by_key(|(_, node)| {
            let category_score = match node.node_type.as_str() {
                "business" => 1_000,
                "service" => 500,
                "touchpoint" => 300,
                "channel" => 200,
                _ => 0,
            };
            let degree_score = degrees.get(node.name.as_str()).copied().unwrap_or_default() * 50;
            category_score + degree_score + node.impact_score
        })
        .map(|(index, _)| index)
        .unwrap_or_default()
}

fn peripheral_position(node_type: &str, index: usize) -> (f64, f64) {
    let row = index as f64;
    match node_type {
        "channel" => (160.0, 130.0 + row * 150.0),
        "data_source" => (160.0, 520.0 + row * 140.0),
        "finance" => (500.0, 520.0 + row * 140.0),
        "touchpoint" => (840.0, 130.0 + row * 150.0),
        "service" => (1160.0, 150.0 + row * 150.0),
        "business" => {
            let offsets = [
                (-250.0, -170.0),
                (-250.0, 170.0),
                (0.0, -200.0),
                (0.0, 200.0),
            ];
            let (x_offset, y_offset) = offsets[index % offsets.len()];
            let ring = (index / offsets.len()) as f64;
            (
                520.0 + x_offset - ring * 40.0,
                300.0 + y_offset + ring * 40.0,
            )
        }
        _ => (520.0, 120.0 + row * 150.0),
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
    let positions = structured_map_positions(output);

    for (index, node) in output.nodes.iter().enumerate() {
        let id = Uuid::new_v4().to_string();
        label_to_id.insert(node.name.clone(), id.clone());
        let position = positions
            .get(index)
            .copied()
            .unwrap_or((node.position_x, node.position_y));
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
                    json!({ "x": position.0, "y": position.1 }).to_string(),
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

#[allow(clippy::too_many_arguments)]
fn sync_nodes_for_updated_item_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    item_id: &str,
    name: &str,
    item_type: &str,
    description: Option<&str>,
    confidence_status: &str,
    impact_score: i64,
    adoption_status: &str,
    updated_at: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "UPDATE nodes
             SET label = ?1,
                 node_type = ?2,
                 description = ?3,
                 confidence_status = ?4,
                 influence_level = ?5,
                 adoption_status = ?6,
                 updated_at = ?7
             WHERE project_id = ?8 AND extracted_item_id = ?9",
            params![
                name,
                item_type,
                empty_to_none(description.map(str::to_string)),
                confidence_status,
                impact_score.to_string(),
                adoption_status,
                updated_at,
                project_id,
                item_id
            ],
        )
        .map_err(|error| error.to_string())?;

    if adoption_status == "rejected" {
        transaction
            .execute(
                "UPDATE edges
                 SET adoption_status = 'rejected', updated_at = ?1
                 WHERE project_id = ?2
                   AND (
                     source_node_id IN (
                       SELECT id FROM nodes WHERE project_id = ?2 AND extracted_item_id = ?3
                     )
                     OR target_node_id IN (
                       SELECT id FROM nodes WHERE project_id = ?2 AND extracted_item_id = ?3
                     )
                   )",
                params![updated_at, project_id, item_id],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn clear_map_analysis_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM suggestions WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM ai_comments
             WHERE project_id = ?1
               AND comment_type IN ('summary', 'strong_flow', 'bottleneck', 'unconnected', 'question')",
            [project_id],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn clear_map_outputs_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
) -> Result<(), String> {
    clear_map_analysis_in_transaction(transaction, project_id)?;
    transaction
        .execute(
            "DELETE FROM ai_comments WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM edges WHERE project_id = ?1", [project_id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM nodes WHERE project_id = ?1", [project_id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM view_layouts WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn build_analysis_output(workspace: &ProjectWorkspace) -> Value {
    let (nodes, edges) = active_map_scope(workspace);
    let node_names = nodes
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
        "strongFlows": edges.iter().filter(|edge| edge.strength.as_deref() == Some("strong")).take(3).map(|edge| edge.label.clone().unwrap_or_else(|| "強い導線".to_string())).collect::<Vec<_>>(),
        "bottlenecks": ["商談後の継続接点とデータ活用の確認が必要です。"],
        "unconnectedSynergies": ["データ資料と集客チャネルを接続できる余地があります。"],
        "questions": ["継続契約につながる主要な接点はどこですか？", "売上CSVと顧客台帳は同じ顧客IDで接続できますか？"],
        "opportunities": [{
            "title": "接点データを使った継続導線の強化",
            "rationale": "マップ上で接点とデータ資料が分かれているため、統合すると再提案の精度が上がる可能性があります。",
            "expectedImpact": "継続率と商談化率の改善"
        }],
        "risks": ["情報ソースだけでは推定のため、追加確認が必要です。"]
    })
}

fn analysis_prompt(workspace: &ProjectWorkspace, purpose_context: &PromptPurposeContext) -> String {
    let (active_nodes, active_edges) = active_map_scope(workspace);
    let nodes = active_nodes
        .iter()
        .map(|node| format!("- node: {} ({})", node.label, node.node_type))
        .collect::<Vec<_>>()
        .join("\n");
    let edges = active_edges
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
        "MVP-1の売上マップから、考える材料、売上の流れ、強い導線、詰まり、未接続シナジー候補、確認質問、次に試す一手を日本語で短く生成してください。\
         答えを完成させるのではなく、PurposeContextの目的に合わせて、ユーザーが次に何を考え、何を確認し、何を試すか判断できる準備状態を作ってください。schemaVersionは{}です。\n\n{}\n\nNodes:\n{}\n\nEdges:\n{}",
        SCHEMA_VERSION,
        purpose_context.prompt_block(),
        nodes,
        edges
    )
}

fn business_impact_prompt(
    workspace: &ProjectWorkspace,
    purpose_context: &PromptPurposeContext,
) -> String {
    let (active_nodes, active_edges) = active_map_scope(workspace);
    let nodes = active_nodes
        .iter()
        .map(|node| {
            format!(
                "- label: {}\n  type: {}\n  confidence: {}\n  influence: {}\n  summary: {}",
                node.label,
                node.node_type,
                node.confidence_status.as_deref().unwrap_or("estimated"),
                node.influence_level.as_deref().unwrap_or("2"),
                node.description.as_deref().unwrap_or("説明なし")
            ) + &format!(
                "\n  sourceTrace: {}",
                source_trace_for_node(node, workspace)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let edges = active_edges
        .iter()
        .map(|edge| {
            let source = active_nodes
                .iter()
                .find(|node| node.id.as_str() == edge.source_node_id.as_str())
                .map(|node| node.label.as_str())
                .unwrap_or("source");
            let target = active_nodes
                .iter()
                .find(|node| node.id.as_str() == edge.target_node_id.as_str())
                .map(|node| node.label.as_str())
                .unwrap_or("target");
            format!(
                "- {} -> {} / label: {} / flow: {} / strength: {} / evidence: {}",
                source,
                target,
                edge.label.as_deref().unwrap_or("導線"),
                edge.flow_type.as_deref().unwrap_or("unknown"),
                edge.strength.as_deref().unwrap_or("normal"),
                edge.evidence
                    .as_deref()
                    .unwrap_or("情報ソース要約からの推定")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "顧客導線の売上マップで見えた課題・施策について、次に試す一手の候補を日本語で生成してください。\
         目的は「どこに手を入れると売上・利益・工数に効きそうか」を根拠付きで見える化し、ユーザーが自分で次に考えることや動くことを判断できる状態にすることです。\
         PurposeContextの目的に合う施策を優先し、目的と関係が薄い施策は優先度を下げてください。\
         施策ごとに、売上影響、利益影響、費用、工数、効果発生までの時間、確度、0-100のimpactScore、根拠、関連ノードラベルを必ず返してください。\
         evidenceには、関連ノードのsourceTraceに含まれるsourceChunkIdやsourceFile名を使って、どの情報ソースからの判断か分かる短い説明を含めてください。\
         不確実な情報はunknownまたはneeds_reviewにしてください。schemaVersionは{}です。\n\n{}\n\nNodes:\n{}\n\nEdges:\n{}",
        SCHEMA_VERSION,
        purpose_context.prompt_block(),
        nodes,
        edges
    )
}

fn map_insight_prompt(
    workspace: &ProjectWorkspace,
    target_kind: &str,
    target_id: Option<&str>,
    question_type: &str,
    purpose_context: &PromptPurposeContext,
) -> Result<String, String> {
    let target_context = map_insight_target_context(workspace, target_kind, target_id)?;
    let question = map_insight_question_label(question_type);
    let (active_nodes, active_edges) = active_map_scope(workspace);
    let nodes = active_nodes
        .iter()
        .map(|node| {
            format!(
                "- {} ({}) / confidence={} / influence={} / summary={} / sourceTrace={}",
                node.label,
                node.node_type,
                node.confidence_status.as_deref().unwrap_or("estimated"),
                node.influence_level.as_deref().unwrap_or("2"),
                node.description.as_deref().unwrap_or("説明なし"),
                source_trace_for_node(node, workspace)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let edges = active_edges
        .iter()
        .map(|edge| {
            let source = node_label(workspace, &edge.source_node_id);
            let target = node_label(workspace, &edge.target_node_id);
            format!(
                "- {} -> {} / label={} / flow={} / strength={} / confidence={} / evidence={}",
                source,
                target,
                edge.label.as_deref().unwrap_or("導線"),
                edge.flow_type.as_deref().unwrap_or("unknown"),
                edge.strength.as_deref().unwrap_or("normal"),
                edge.confidence_status.as_deref().unwrap_or("estimated"),
                edge.evidence
                    .as_deref()
                    .unwrap_or("情報ソース要約からの推定")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(format!(
        "以下の売上マップ文脈をもとに、非IT寄りの相談者にも分かる短い壁打ち回答を日本語で返してください。\
         PurposeContextの目的に沿って、次に何を考えるべきかが分かる回答にしてください。\
         対象を断定しすぎず、情報ソースの根拠が薄い場合はneeds_reviewにしてください。\
         answerは2-4文、keyPointsは1-5件、followUpQuestionsは次に確認すべき質問を最大5件にしてください。\
         schemaVersionは{}です。\n\n{}\n\nQuestionType: {}\nQuestion: {}\nTarget:\n{}\n\nMap nodes:\n{}\n\nMap edges:\n{}",
        SCHEMA_VERSION,
        purpose_context.prompt_block(),
        question_type,
        question,
        target_context,
        nodes,
        edges
    ))
}

fn map_insight_target_context(
    workspace: &ProjectWorkspace,
    target_kind: &str,
    target_id: Option<&str>,
) -> Result<String, String> {
    match target_kind {
        "map" => Ok("マップ全体".to_string()),
        "node" => {
            let node_id = target_id.ok_or_else(|| "target_id is required.".to_string())?;
            let node = workspace
                .nodes
                .iter()
                .find(|node| node.id == node_id && node.adoption_status != "rejected")
                .ok_or_else(|| "対象ノードが見つかりません。".to_string())?;
            Ok(format!(
                "ノード: {} ({}) / confidence={} / influence={} / description={} / sourceTrace={}",
                node.label,
                node.node_type,
                node.confidence_status.as_deref().unwrap_or("estimated"),
                node.influence_level.as_deref().unwrap_or("2"),
                node.description.as_deref().unwrap_or("説明なし"),
                source_trace_for_node(node, workspace)
            ))
        }
        "edge" => {
            let edge_id = target_id.ok_or_else(|| "target_id is required.".to_string())?;
            let edge = workspace
                .edges
                .iter()
                .find(|edge| edge.id == edge_id && edge.adoption_status != "rejected")
                .ok_or_else(|| "対象導線が見つかりません。".to_string())?;
            Ok(format!(
                "導線: {} -> {} / label={} / flow={} / strength={} / confidence={} / evidence={}",
                node_label(workspace, &edge.source_node_id),
                node_label(workspace, &edge.target_node_id),
                edge.label.as_deref().unwrap_or("導線"),
                edge.flow_type.as_deref().unwrap_or("unknown"),
                edge.strength.as_deref().unwrap_or("normal"),
                edge.confidence_status.as_deref().unwrap_or("estimated"),
                edge.evidence
                    .as_deref()
                    .unwrap_or("情報ソース要約からの推定")
            ))
        }
        _ => Err(format!("Unsupported target_kind: {target_kind}")),
    }
}

fn map_insight_question_label(question_type: &str) -> &'static str {
    match question_type {
        "importance" => "なぜ重要そうに見えるかを説明してください。",
        "bottleneck" => "詰まりや弱い導線になりそうな点を説明してください。",
        "next_questions" => "次に確認すべきことを整理してください。",
        "revenue_action" => "売上や利益に効きそうな次の一手を説明してください。",
        _ => "この対象の意味を分かりやすく説明してください。",
    }
}

fn build_map_insight_output(
    workspace: &ProjectWorkspace,
    target_kind: &str,
    target_id: Option<&str>,
    question_type: &str,
) -> Value {
    let target = map_insight_target_title(workspace, target_kind, target_id);
    let question = map_insight_question_label(question_type);
    let (nodes, edges) = active_map_scope(workspace);
    let answer = match question_type {
        "importance" => format!(
            "{target}は、顧客導線上の接続や施策優先度を考えるうえで確認価値があります。情報ソース要約ベースの推定を含むため、実際の状況では重要度と実態を確認してください。"
        ),
        "bottleneck" => format!(
            "{target}は、前後の導線や根拠が薄い場合に詰まりの候補になります。接続先、担当、次のアクションが明確かを確認すると理解が深まります。"
        ),
        "next_questions" => format!(
            "{target}について、実際の顧客行動、担当者、成果指標を確認するとマップの納得感が上がります。"
        ),
        "revenue_action" => format!(
            "{target}を売上・利益へつなげるには、強い導線を伸ばすか、弱い接点を補強する小さな施策から確認するのが現実的です。"
        ),
        _ => format!(
            "{target}は、現在のマップにある{}件のノードと{}件の導線の中で理解を深める対象です。情報ソース要約からの初期整理なので、確定情報と推定を分けて確認してください。",
            nodes.len(),
            edges.len()
        ),
    };

    json!({
        "schemaVersion": SCHEMA_VERSION,
        "answer": answer,
        "keyPoints": [
            format!("対象: {target}"),
            "情報ソース要約とマップ構造からの確認メモです。",
            "確定情報ではなく、会議中に確認するための下書きとして扱います。"
        ],
        "followUpQuestions": [
            question,
            "この対象の成果指標は何ですか？",
            "この導線や項目を担当している人は誰ですか？"
        ],
        "confidenceStatus": "estimated"
    })
}

fn map_insight_target_title(
    workspace: &ProjectWorkspace,
    target_kind: &str,
    target_id: Option<&str>,
) -> String {
    match target_kind {
        "node" => target_id
            .and_then(|id| workspace.nodes.iter().find(|node| node.id == id))
            .map(|node| format!("ノード「{}」", node.label))
            .unwrap_or_else(|| "選択中ノード".to_string()),
        "edge" => target_id
            .and_then(|id| workspace.edges.iter().find(|edge| edge.id == id))
            .map(|edge| {
                format!(
                    "導線「{} -> {}」",
                    node_label(workspace, &edge.source_node_id),
                    node_label(workspace, &edge.target_node_id)
                )
            })
            .unwrap_or_else(|| "選択中導線".to_string()),
        _ => "マップ全体".to_string(),
    }
}

fn node_label<'a>(workspace: &'a ProjectWorkspace, node_id: &str) -> &'a str {
    workspace
        .nodes
        .iter()
        .find(|node| node.id == node_id)
        .map(|node| node.label.as_str())
        .unwrap_or("node")
}

fn source_trace_for_node(node: &MapNodeRow, workspace: &ProjectWorkspace) -> String {
    let Some(extracted_item_id) = node.extracted_item_id.as_deref() else {
        return "sourceなし".to_string();
    };
    let Some(item) = workspace
        .extracted_items
        .iter()
        .find(|item| item.id == extracted_item_id)
    else {
        return "sourceなし".to_string();
    };
    let traces = item
        .sources
        .iter()
        .take(4)
        .map(|source| {
            format!(
                "sourceChunkId={}, sourceFile={}, page={}, sheet={}, rowStart={}",
                source.source_chunk_id.as_deref().unwrap_or("-"),
                source.source_file_name.as_deref().unwrap_or("-"),
                source
                    .page_number
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "-".to_string()),
                source.sheet_name.as_deref().unwrap_or("-"),
                source
                    .row_start
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "-".to_string())
            )
        })
        .collect::<Vec<_>>();

    if traces.is_empty() {
        "sourceなし".to_string()
    } else {
        traces.join("; ")
    }
}

fn active_map_scope(workspace: &ProjectWorkspace) -> (Vec<&MapNodeRow>, Vec<&MapEdgeRow>) {
    let nodes = exportable_nodes(&workspace.nodes);
    let node_ids = nodes
        .iter()
        .map(|node| node.id.clone())
        .collect::<HashSet<_>>();
    let edges = exportable_edges(&workspace.edges, &node_ids);

    (nodes, edges)
}

fn build_suggestions_output(workspace: &ProjectWorkspace) -> Value {
    let (nodes, _) = active_map_scope(workspace);
    let labels = nodes
        .iter()
        .map(|node| node.label.clone())
        .collect::<Vec<_>>();
    let first = labels
        .first()
        .cloned()
        .unwrap_or_else(|| "主要導線".to_string());
    let second = labels
        .get(1)
        .cloned()
        .unwrap_or_else(|| "顧客接点".to_string());
    let third = labels
        .get(2)
        .cloned()
        .unwrap_or_else(|| "データ資料".to_string());

    json!({
        "schemaVersion": SCHEMA_VERSION,
        "cards": [
            {
                "title": "問い合わせ後フォロー導線の整理",
                "action": "Web問い合わせから初回商談までの担当、期限、記録先を確認する。",
                "priority": "high",
                "rationale": "顧客接点の詰まりを最初に解消しやすい。",
                "expectedRevenueImpact": "high",
                "expectedProfitImpact": "medium",
                "costLevel": "low",
                "effortLevel": "low",
                "timeToImpact": "short",
                "confidenceStatus": "estimated",
                "impactScore": 82,
                "evidence": "顧客導線上の問い合わせから商談までの接続を強化する施策です。",
                "relatedNodeLabels": [first, second]
            },
            {
                "title": "顧客台帳と売上CSVの突合",
                "action": "顧客ID、会社名、メールアドレスのどれで紐づくか確認する。",
                "priority": "medium",
                "rationale": "データ資料を施策判断に使える状態にするため。",
                "expectedRevenueImpact": "medium",
                "expectedProfitImpact": "high",
                "costLevel": "medium",
                "effortLevel": "medium",
                "timeToImpact": "mid",
                "confidenceStatus": "needs_review",
                "impactScore": 68,
                "evidence": "財務参考情報やデータ資料がマップにある場合、施策の優先度判断に使える可能性があります。",
                "relatedNodeLabels": [third]
            },
            {
                "title": "展示会リードの再接触条件",
                "action": "再接触すべきリード条件と除外条件をヒアリングする。",
                "priority": "medium",
                "rationale": "未接続チャネルを既存サービスへつなげるため。",
                "expectedRevenueImpact": "medium",
                "expectedProfitImpact": "medium",
                "costLevel": "low",
                "effortLevel": "medium",
                "timeToImpact": "mid",
                "confidenceStatus": "estimated",
                "impactScore": 61,
                "evidence": "未接続の集客チャネルを既存サービスや商談導線へつなげる仮説です。",
                "relatedNodeLabels": labels.iter().take(3).cloned().collect::<Vec<_>>()
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

fn insert_ai_question_action_items(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    ai_run_id: &str,
    output: &crate::ai_schema::AiAnalysisOutput,
) -> Result<(), String> {
    let now = now_rfc3339()?;

    for question in &output.questions {
        let body = question.trim();
        if body.is_empty() {
            continue;
        }

        let existing_id: Option<String> = transaction
            .query_row(
                "SELECT id
                 FROM action_items
                 WHERE project_id = ?1
                   AND body = ?2
                   AND status = 'open'
                 LIMIT 1",
                params![project_id, body],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        if existing_id.is_some() {
            continue;
        }

        transaction
            .execute(
                "INSERT INTO action_items (
                    id, project_id, ai_run_id, source_type, source_id, title, body,
                    status, priority, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, 'ai_question', ?4, '確認質問', ?5, 'open', 'medium', ?6, ?7)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id,
                    ai_run_id,
                    ai_run_id,
                    body,
                    now.as_str(),
                    now.as_str()
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
    workspace: &ProjectWorkspace,
) -> Result<(), String> {
    let now = now_rfc3339()?;

    for card in &output.cards {
        let related_node_ids_json = related_node_ids_json_for_suggestion(card, workspace)?;
        transaction
            .execute(
                "INSERT INTO suggestions (
                    id, project_id, ai_run_id, title, description, priority,
                    adoption_status, rationale, related_node_ids_json,
                    expected_revenue_impact, expected_profit_impact, cost_level,
                    effort_level, time_to_impact, confidence_status, impact_score,
                    evidence, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id,
                    ai_run_id,
                    card.title,
                    card.action,
                    card.priority,
                    card.rationale,
                    related_node_ids_json,
                    card.expected_revenue_impact,
                    card.expected_profit_impact,
                    card.cost_level,
                    card.effort_level,
                    card.time_to_impact,
                    card.confidence_status,
                    card.impact_score,
                    card.evidence,
                    now,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn insert_map_insight_comment(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    ai_run_id: &str,
    output: &crate::ai_schema::MapInsightOutput,
    target_kind: &str,
    target_id: Option<&str>,
    question_type: &str,
) -> Result<(), String> {
    let now = now_rfc3339()?;
    let title = format!(
        "壁打ち: {}",
        match question_type {
            "importance" => "重要度",
            "bottleneck" => "詰まり",
            "next_questions" => "確認質問",
            "revenue_action" => "売上への一手",
            _ => "説明",
        }
    );
    let mut body = output.answer.clone();
    if !output.key_points.is_empty() {
        body.push_str("\n要点: ");
        body.push_str(&output.key_points.join(" / "));
    }
    if !output.follow_up_questions.is_empty() {
        body.push_str("\n次に聞くこと: ");
        body.push_str(&output.follow_up_questions.join(" / "));
    }

    transaction
        .execute(
            "INSERT INTO ai_comments (
                id, project_id, ai_run_id, comment_type, title, body, confidence_status, created_at
             ) VALUES (?1, ?2, ?3, 'map_insight', ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                project_id,
                ai_run_id,
                format!(
                    "{} [{}{}]",
                    title,
                    target_kind,
                    target_id
                        .map(|value| format!(":{value}"))
                        .unwrap_or_default()
                ),
                body,
                output.confidence_status,
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn related_node_ids_json_for_suggestion(
    card: &crate::ai_schema::SuggestionCard,
    workspace: &ProjectWorkspace,
) -> Result<String, String> {
    let active_nodes = exportable_nodes(&workspace.nodes);
    let mut matched_ids = Vec::new();

    for label in &card.related_node_labels {
        if let Some(node) = active_nodes.iter().find(|node| {
            node.label == *label || node.label.contains(label) || label.contains(&node.label)
        }) {
            if !matched_ids.contains(&node.id) {
                matched_ids.push(node.id.clone());
            }
        }
    }

    if matched_ids.is_empty() {
        let text = format!("{} {} {}", card.title, card.action, card.rationale);
        for node in &active_nodes {
            if text.contains(&node.label) && !matched_ids.contains(&node.id) {
                matched_ids.push(node.id.clone());
            }
        }
    }

    serde_json::to_string(&matched_ids).map_err(|error| error.to_string())
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
    record_snapshot_with_metadata_in_transaction(transaction, project_id, version_type, None, None)
}

fn record_snapshot_with_metadata_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    version_type: &str,
    name: Option<&str>,
    memo: Option<&str>,
) -> Result<(), String> {
    let now = now_rfc3339()?;
    let snapshot = json!({
        "versionType": version_type,
        "name": name,
        "memo": memo,
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
                "related_node_ids_json",
                "expected_revenue_impact",
                "expected_profit_impact",
                "cost_level",
                "effort_level",
                "time_to_impact",
                "confidence_status",
                "impact_score",
                "evidence",
                "memo",
            ],
            project_id,
        )?,
        "viewLayouts": snapshot_table(
            transaction,
            "view_layouts",
            &["id", "view_id", "layout_json", "updated_at"],
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
        "actionItems": snapshot_table(
            transaction,
            "action_items",
            &[
                "id",
                "ai_run_id",
                "source_type",
                "source_id",
                "title",
                "body",
                "status",
                "priority",
                "memo",
                "updated_at",
                "completed_at",
            ],
            project_id,
        )?,
        "mapNotes": snapshot_table(
            transaction,
            "map_notes",
            &["id", "title", "body", "note_type", "updated_at"],
            project_id,
        )?,
        "counts": {
            "extractedItems": count_table(transaction, "extracted_items", project_id)?,
            "itemSources": count_table(transaction, "item_sources", project_id)?,
            "nodes": count_table(transaction, "nodes", project_id)?,
            "edges": count_table(transaction, "edges", project_id)?,
            "suggestions": count_table(transaction, "suggestions", project_id)?,
            "aiComments": count_table(transaction, "ai_comments", project_id)?,
            "viewLayouts": count_table(transaction, "view_layouts", project_id)?,
            "actionItems": count_table(transaction, "action_items", project_id)?,
            "mapNotes": count_table(transaction, "map_notes", project_id)?,
        }
    });

    transaction
        .execute(
            "INSERT INTO versions (id, project_id, version_type, name, memo, snapshot_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                project_id,
                version_type,
                name,
                memo,
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
    let nodes = exportable_nodes(&workspace.nodes);
    let node_ids = nodes
        .iter()
        .map(|node| node.id.clone())
        .collect::<HashSet<_>>();
    let node_labels = nodes
        .iter()
        .map(|node| (node.id.as_str(), node.label.as_str()))
        .collect::<HashMap<_, _>>();
    let edges = exportable_edges(&workspace.edges, &node_ids);
    let extracted_items = exportable_extracted_items(&workspace.extracted_items);
    let suggestions = exportable_suggestions(&workspace.suggestions);

    body.push_str(&format!("# {project_name} 売上マップ\n\n"));
    body.push_str("## 概要\n\n");
    if let Some(summary) = workspace
        .ai_comments
        .iter()
        .find(|comment| comment.comment_type == "summary")
    {
        body.push_str(&format!("{}\n\n", summary.body));
    } else {
        body.push_str(
            "マップの材料、抽出カード、顧客導線の売上マップ、次に試す一手の記録です。\n\n",
        );
    }

    body.push_str("## 使用した情報ソース\n\n");
    for source in &workspace.source_files {
        body.push_str(&format!(
            "- {} ({}, {}, {} chunks)\n",
            source.file_name, source.file_type, source.status, source.chunk_count
        ));
    }

    body.push_str("\n## 抽出カード\n\n");
    for item in extracted_items {
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
        nodes.len(),
        edges.len()
    ));
    for edge in edges {
        let source = node_labels
            .get(edge.source_node_id.as_str())
            .copied()
            .unwrap_or("source");
        let target = node_labels
            .get(edge.target_node_id.as_str())
            .copied()
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

    body.push_str("\n## 次に試す一手\n\n");
    if suggestions.is_empty() {
        body.push_str("次に試す一手は未生成です。\n\n");
    } else {
        body.push_str("| 施策 | 優先度 | 売上影響 | 利益影響 | 費用 | 工数 | 確度 | スコア |\n");
        body.push_str("|---|---|---|---|---|---|---|---:|\n");
        for suggestion in &suggestions {
            body.push_str(&format!(
                "| {} | {} | {} | {} | {} | {} | {} | {} |\n",
                markdown_cell(&suggestion.title),
                suggestion.priority,
                suggestion.expected_revenue_impact,
                suggestion.expected_profit_impact,
                suggestion.cost_level,
                suggestion.effort_level,
                suggestion.confidence_status,
                suggestion.impact_score
            ));
        }
        body.push('\n');
        for suggestion in &suggestions {
            body.push_str(&format!(
                "- **{}**: {}\n",
                suggestion.title, suggestion.description
            ));
            if let Some(evidence) = suggestion.evidence.as_deref() {
                body.push_str(&format!("  - 根拠: {}\n", evidence));
            }
            if let Some(rationale) = suggestion.rationale.as_deref() {
                body.push_str(&format!("  - 判断理由: {}\n", rationale));
            }
        }
    }

    body.push_str("\n## 施策カード\n\n");
    for suggestion in suggestions {
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

    body.push_str("\n## 確認事項 / タスク\n\n");
    if workspace.action_items.is_empty() {
        body.push_str("確認事項 / タスクは未登録です。\n");
    } else {
        for action_item in &workspace.action_items {
            body.push_str(&format!(
                "- **{}** [{} / {}]: {}\n",
                action_item.title, action_item.status, action_item.priority, action_item.body
            ));
            if let Some(memo) = action_item.memo.as_deref() {
                body.push_str(&format!("  - メモ: {}\n", memo));
            }
        }
    }

    body.push_str("\n## 思考メモ\n\n");
    if workspace.map_notes.is_empty() {
        body.push_str("思考メモは未登録です。\n");
    } else {
        for note in &workspace.map_notes {
            body.push_str(&format!(
                "- **{}** [{}]: {}\n",
                note.title, note.note_type, note.body
            ));
        }
    }

    body
}

fn markdown_cell(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', " ")
}

fn exportable_adoption(status: &str) -> bool {
    status != "rejected"
}

fn exportable_nodes(nodes: &[MapNodeRow]) -> Vec<&MapNodeRow> {
    nodes
        .iter()
        .filter(|node| exportable_adoption(&node.adoption_status))
        .collect()
}

fn exportable_edges<'a>(
    edges: &'a [MapEdgeRow],
    node_ids: &HashSet<String>,
) -> Vec<&'a MapEdgeRow> {
    edges
        .iter()
        .filter(|edge| {
            exportable_adoption(&edge.adoption_status)
                && node_ids.contains(&edge.source_node_id)
                && node_ids.contains(&edge.target_node_id)
        })
        .collect()
}

fn exportable_extracted_items(items: &[ExtractedItemRow]) -> Vec<&ExtractedItemRow> {
    items
        .iter()
        .filter(|item| exportable_adoption(&item.adoption_status))
        .collect()
}

fn exportable_suggestions(suggestions: &[SuggestionRow]) -> Vec<&SuggestionRow> {
    suggestions
        .iter()
        .filter(|suggestion| exportable_adoption(&suggestion.adoption_status))
        .collect()
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

fn write_nodes_csv(path: &Path, nodes: &[&MapNodeRow]) -> Result<(), String> {
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

fn write_edges_csv(path: &Path, edges: &[&MapEdgeRow]) -> Result<(), String> {
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

fn write_suggestions_csv(path: &Path, suggestions: &[&SuggestionRow]) -> Result<(), String> {
    let mut writer = csv_writer(path)?;
    writer
        .write_record([
            "id",
            "title",
            "description",
            "priority",
            "adoption_status",
            "rationale",
            "related_node_ids",
            "expected_revenue_impact",
            "expected_profit_impact",
            "cost_level",
            "effort_level",
            "time_to_impact",
            "confidence_status",
            "impact_score",
            "evidence",
            "memo",
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
                suggestion.related_node_ids_json.as_str(),
                suggestion.expected_revenue_impact.as_str(),
                suggestion.expected_profit_impact.as_str(),
                suggestion.cost_level.as_str(),
                suggestion.effort_level.as_str(),
                suggestion.time_to_impact.as_str(),
                suggestion.confidence_status.as_str(),
                &suggestion.impact_score.to_string(),
                suggestion.evidence.as_deref().unwrap_or(""),
                suggestion.memo.as_deref().unwrap_or(""),
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

fn write_action_items_csv(path: &Path, action_items: &[ActionItemRow]) -> Result<(), String> {
    let mut writer = csv_writer(path)?;
    writer
        .write_record([
            "id",
            "title",
            "body",
            "status",
            "priority",
            "source_type",
            "source_id",
            "memo",
            "created_at",
            "updated_at",
            "completed_at",
        ])
        .map_err(|error| error.to_string())?;
    for action_item in action_items {
        writer
            .write_record([
                action_item.id.as_str(),
                action_item.title.as_str(),
                action_item.body.as_str(),
                action_item.status.as_str(),
                action_item.priority.as_str(),
                action_item.source_type.as_str(),
                action_item.source_id.as_deref().unwrap_or(""),
                action_item.memo.as_deref().unwrap_or(""),
                action_item.created_at.as_str(),
                action_item.updated_at.as_str(),
                action_item.completed_at.as_deref().unwrap_or(""),
            ])
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

fn write_map_notes_csv(path: &Path, map_notes: &[MapNoteRow]) -> Result<(), String> {
    let mut writer = csv_writer(path)?;
    writer
        .write_record([
            "id",
            "title",
            "body",
            "note_type",
            "created_at",
            "updated_at",
        ])
        .map_err(|error| error.to_string())?;
    for note in map_notes {
        writer
            .write_record([
                note.id.as_str(),
                note.title.as_str(),
                note.body.as_str(),
                note.note_type.as_str(),
                note.created_at.as_str(),
                note.updated_at.as_str(),
            ])
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_app_data_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("synergy-map-{label}-{}", Uuid::new_v4()))
    }

    fn insert_test_project(connection: &Connection, project_id: &str) {
        let now = now_rfc3339().expect("time should format");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at)
                 VALUES (?1, 'Test Project', ?2, ?3)",
                params![project_id, now.as_str(), now.as_str()],
            )
            .expect("project should insert");
    }

    fn insert_test_suggestion(connection: &Connection, project_id: &str, suggestion_id: &str) {
        let now = now_rfc3339().expect("time should format");
        connection
            .execute(
                "INSERT INTO suggestions (
                    id, project_id, title, description, priority, adoption_status,
                    rationale, related_node_ids_json, evidence, created_at, updated_at
                 ) VALUES (?1, ?2, '問い合わせ後フォロー導線の整理', '担当、期限、記録先を確認する。', 'high', 'pending',
                    '顧客接点の詰まりを解消しやすい。', '[]', '問い合わせから商談までの接続が根拠です。', ?3, ?4)",
                params![suggestion_id, project_id, now.as_str(), now.as_str()],
            )
            .expect("suggestion should insert");
    }

    #[test]
    fn local_extraction_fallback_does_not_persist_source_text() {
        let chunks = vec![ExtractionChunk {
            id: "chunk-1".to_string(),
            source_file_id: "source-file-1".to_string(),
            file_name: "secret-client-plan.md".to_string(),
            file_type: "markdown".to_string(),
            metadata_json: "{}".to_string(),
            content: "SECRET_CLIENT_CONTRACT_LINE\nSECRET_CLIENT_PRICE_TABLE".to_string(),
        }];

        let output = build_extracted_items_output(&chunks);
        let serialized = output.to_string();

        assert!(!serialized.contains("SECRET_CLIENT"));
        assert!(!serialized.contains("secret-client-plan"));
        assert!(serialized.contains(local_summary_only_quote()));
    }

    #[test]
    fn onboarding_brief_marks_sparse_input_as_needs_review() {
        let content = onboarding_brief_markdown(
            "山田製作所",
            "sales_flow",
            "売上導線を整理したい",
            None,
            None,
            &[],
            &[],
            None,
        );

        assert!(content.contains("山田製作所"));
        assert!(content.contains("売上導線を整理したい"));
        assert_eq!(
            inferred_confidence_status(&content, "onboarding_brief"),
            "needs_review"
        );
    }

    #[test]
    fn onboarding_brief_keeps_url_inputs_as_source_context() {
        let content = onboarding_brief_markdown(
            "山田製作所",
            "sns_web_sales",
            "SNS / Webから売上につなげたい",
            Some("製造業"),
            Some("Web問い合わせから商談につながる導線を確認したい。"),
            &[
                "https://example.com".to_string(),
                "https://lp.example.com".to_string(),
            ],
            &["https://instagram.com/example".to_string()],
            Some("保守サービスと部品販売を提供している。"),
        );

        assert!(content.contains("https://example.com"));
        assert!(content.contains("https://lp.example.com"));
        assert!(content.contains("https://instagram.com/example"));
        assert_eq!(
            onboarding_information_level(
                &content,
                &[
                    "https://example.com".to_string(),
                    "https://lp.example.com".to_string(),
                ],
                &["https://instagram.com/example".to_string()],
                Some("保守サービスと部品販売を提供している。"),
            ),
            "high"
        );
    }

    #[test]
    fn purpose_context_is_included_in_prompts_and_request_summary() {
        let metadata = json!({
            "sourceKind": "onboarding_brief",
            "purposeId": "existing_customer_upsell",
            "purposeLabel": "既存顧客への追加提案を考えたい",
            "informationLevel": "low",
            "hypothesisMode": true,
        })
        .to_string();
        let chunks = vec![ExtractionChunk {
            id: "chunk-1".to_string(),
            source_file_id: "source-file-1".to_string(),
            file_name: "マップ作成メモ.md".to_string(),
            file_type: "onboarding_brief".to_string(),
            metadata_json: metadata,
            content: "既存顧客に追加提案したい。".to_string(),
        }];

        let context = prompt_purpose_context_from_chunks(&chunks);
        let prompt = extraction_prompt(&chunks, &context);
        let request_summary = context.request_summary();

        assert!(prompt.contains("既存顧客への追加提案を考えたい"));
        assert!(prompt.contains("hypothesis_map"));
        assert_eq!(
            request_summary["purposeId"],
            json!("existing_customer_upsell")
        );
        assert_eq!(request_summary["generationMode"], json!("hypothesis_map"));
    }

    #[test]
    fn onboarding_summary_keeps_user_entered_business_context() {
        let content = onboarding_brief_markdown(
            "山田製作所",
            "sns_web_sales",
            "SNS / Webから売上につなげたい",
            Some("製造業"),
            Some("Web問い合わせはあるが、商談化と保守サービスへの導線が弱い。"),
            &["https://example.com".to_string()],
            &["https://instagram.com/example".to_string()],
            Some("保守サービスと部品販売を提供している。"),
        );
        let chunk = ExtractionChunk {
            id: "chunk-1".to_string(),
            source_file_id: "source-file-1".to_string(),
            file_name: "マップ作成メモ.md".to_string(),
            file_type: "onboarding_brief".to_string(),
            metadata_json: "{}".to_string(),
            content,
        };

        let summary = summarize_chunk_for_ai(&chunk);

        assert!(summary.contains("山田製作所"));
        assert!(summary.contains("Web問い合わせ"));
        assert!(summary.contains("保守サービス"));
        assert!(summary.contains("https://example.com"));
    }

    #[test]
    fn structured_map_positions_place_business_at_center() {
        let output = crate::ai_schema::MapDraftOutput {
            schema_version: SCHEMA_VERSION.to_string(),
            nodes: vec![
                crate::ai_schema::MapNodeDraft {
                    extracted_item_id: Some("channel-1".to_string()),
                    name: "Instagram".to_string(),
                    node_type: "channel".to_string(),
                    description: "SNS集客".to_string(),
                    confidence_status: "estimated".to_string(),
                    impact_score: 2,
                    information_richness: 60,
                    position_x: 0.0,
                    position_y: 0.0,
                },
                crate::ai_schema::MapNodeDraft {
                    extracted_item_id: Some("business-1".to_string()),
                    name: "整体院".to_string(),
                    node_type: "business".to_string(),
                    description: "中心事業".to_string(),
                    confidence_status: "confirmed".to_string(),
                    impact_score: 3,
                    information_richness: 80,
                    position_x: 0.0,
                    position_y: 0.0,
                },
                crate::ai_schema::MapNodeDraft {
                    extracted_item_id: Some("service-1".to_string()),
                    name: "継続ケア".to_string(),
                    node_type: "service".to_string(),
                    description: "継続商品".to_string(),
                    confidence_status: "estimated".to_string(),
                    impact_score: 2,
                    information_richness: 70,
                    position_x: 0.0,
                    position_y: 0.0,
                },
            ],
            edges: vec![
                crate::ai_schema::MapEdgeDraft {
                    source_node_label: "Instagram".to_string(),
                    target_node_label: "整体院".to_string(),
                    edge_type: "normal".to_string(),
                    flow_type: "awareness".to_string(),
                    strength: "normal".to_string(),
                    confidence_status: "estimated".to_string(),
                    label: "認知".to_string(),
                    evidence: "test".to_string(),
                },
                crate::ai_schema::MapEdgeDraft {
                    source_node_label: "整体院".to_string(),
                    target_node_label: "継続ケア".to_string(),
                    edge_type: "strong".to_string(),
                    flow_type: "retention".to_string(),
                    strength: "strong".to_string(),
                    confidence_status: "estimated".to_string(),
                    label: "継続".to_string(),
                    evidence: "test".to_string(),
                },
            ],
        };

        let positions = structured_map_positions(&output);

        assert_eq!(positions[1], (520.0, 300.0));
        assert!(positions[0].0 < positions[1].0);
        assert!(positions[2].0 > positions[1].0);
    }

    #[test]
    fn layout_position_parser_preserves_optional_size() {
        let parsed = parse_layout_position_map(
            r#"{"positions":[{"nodeId":"node-1","x":12.0,"y":24.0,"width":220.0,"height":140.0}]}"#,
        )
        .expect("layout should parse");

        assert_eq!(
            parsed.get("node-1"),
            Some(&MapLayoutValues {
                x: 12.0,
                y: 24.0,
                width: Some(220.0),
                height: Some(140.0),
            })
        );
    }

    #[test]
    fn map_position_json_omits_unset_size() {
        let position = MapPositionInput {
            node_id: "node-1".to_string(),
            x: 12.0,
            y: 24.0,
            width: None,
            height: None,
        };

        let value = map_position_json(&position);

        assert_eq!(value["x"], json!(12.0));
        assert_eq!(value["y"], json!(24.0));
        assert!(value.get("width").is_none());
        assert!(value.get("height").is_none());
    }

    #[test]
    fn invalid_default_export_dir_falls_back_to_app_exports() {
        let app_data_dir = temp_app_data_dir("export-fallback");
        fs::create_dir_all(&app_data_dir).expect("app data dir should exist");
        let db_path = app_data_dir.join("synergy-map.db");
        let invalid_export_path = app_data_dir.join("not-a-directory");
        fs::write(&invalid_export_path, b"file").expect("invalid path should be file");
        crate::app_settings::save_ai_settings(
            &db_path,
            &crate::app_settings::AiSettings {
                default_export_dir: Some(invalid_export_path.display().to_string()),
                ..crate::app_settings::AiSettings::default()
            },
        )
        .expect("settings should save");

        let target =
            resolve_export_target(&db_path, &app_data_dir, "project-1").expect("target resolves");

        assert_eq!(target.primary_dir, exports_dir(&app_data_dir, "project-1"));
        assert!(target.warning.is_some());
        assert!(!target.used_configured_dir);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn action_item_status_validation_allows_only_phase1_states() {
        assert!(ensure_allowed_action_status("open").is_ok());
        assert!(ensure_allowed_action_status("done").is_ok());
        assert!(ensure_allowed_action_status("dismissed").is_ok());
        assert!(ensure_allowed_action_status("blocked").is_err());
    }

    #[test]
    fn suggestion_can_be_promoted_to_action_item() {
        let app_data_dir = temp_app_data_dir("suggestion-action");
        fs::create_dir_all(&app_data_dir).expect("app data dir should exist");
        let db_path = app_data_dir.join("synergy-map.db");
        crate::init_database(&db_path).expect("db should initialize");
        let connection = open_connection(&db_path).expect("connection should open");
        let project_id = "project-1";
        let suggestion_id = "suggestion-1";
        insert_test_project(&connection, project_id);
        insert_test_suggestion(&connection, project_id, suggestion_id);
        drop(connection);

        let workspace = create_action_item_from_suggestion_inner(
            &db_path,
            project_id.to_string(),
            suggestion_id.to_string(),
        )
        .expect("suggestion should promote");

        assert_eq!(workspace.action_items.len(), 1);
        assert_eq!(workspace.action_items[0].source_type, "suggestion");
        assert_eq!(
            workspace.action_items[0].source_id.as_deref(),
            Some(suggestion_id)
        );
        assert_eq!(workspace.action_items[0].priority, "high");

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn suggestion_promotion_does_not_duplicate_open_action_item() {
        let app_data_dir = temp_app_data_dir("suggestion-action-dedupe");
        fs::create_dir_all(&app_data_dir).expect("app data dir should exist");
        let db_path = app_data_dir.join("synergy-map.db");
        crate::init_database(&db_path).expect("db should initialize");
        let connection = open_connection(&db_path).expect("connection should open");
        let project_id = "project-1";
        let suggestion_id = "suggestion-1";
        insert_test_project(&connection, project_id);
        insert_test_suggestion(&connection, project_id, suggestion_id);
        drop(connection);

        create_action_item_from_suggestion_inner(
            &db_path,
            project_id.to_string(),
            suggestion_id.to_string(),
        )
        .expect("first promotion should work");
        let workspace = create_action_item_from_suggestion_inner(
            &db_path,
            project_id.to_string(),
            suggestion_id.to_string(),
        )
        .expect("second promotion should be idempotent");

        assert_eq!(workspace.action_items.len(), 1);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn suggestion_promotion_does_not_duplicate_equivalent_open_action_item() {
        let app_data_dir = temp_app_data_dir("suggestion-action-equivalent-dedupe");
        fs::create_dir_all(&app_data_dir).expect("app data dir should exist");
        let db_path = app_data_dir.join("synergy-map.db");
        crate::init_database(&db_path).expect("db should initialize");
        let connection = open_connection(&db_path).expect("connection should open");
        let project_id = "project-1";
        insert_test_project(&connection, project_id);
        insert_test_suggestion(&connection, project_id, "suggestion-1");
        insert_test_suggestion(&connection, project_id, "suggestion-2");
        drop(connection);

        create_action_item_from_suggestion_inner(
            &db_path,
            project_id.to_string(),
            "suggestion-1".to_string(),
        )
        .expect("first promotion should work");
        let workspace = create_action_item_from_suggestion_inner(
            &db_path,
            project_id.to_string(),
            "suggestion-2".to_string(),
        )
        .expect("equivalent promotion should be idempotent");

        assert_eq!(workspace.action_items.len(), 1);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn missing_suggestion_promotion_returns_error() {
        let app_data_dir = temp_app_data_dir("suggestion-action-missing");
        fs::create_dir_all(&app_data_dir).expect("app data dir should exist");
        let db_path = app_data_dir.join("synergy-map.db");
        crate::init_database(&db_path).expect("db should initialize");
        let connection = open_connection(&db_path).expect("connection should open");
        insert_test_project(&connection, "project-1");
        drop(connection);

        let result = create_action_item_from_suggestion_inner(
            &db_path,
            "project-1".to_string(),
            "missing-suggestion".to_string(),
        );

        assert!(result.is_err());

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn named_version_stores_snapshot_with_name_and_memo() {
        let app_data_dir = temp_app_data_dir("named-version");
        fs::create_dir_all(&app_data_dir).expect("app data dir should exist");
        let db_path = app_data_dir.join("synergy-map.db");
        crate::init_database(&db_path).expect("db should initialize");
        let mut connection = open_connection(&db_path).expect("connection should open");
        let project_id = "project-1";
        insert_test_project(&connection, project_id);

        let transaction = connection.transaction().expect("transaction should start");
        record_snapshot_with_metadata_in_transaction(
            &transaction,
            project_id,
            "named",
            Some("5月試験運用前"),
            Some("実事業メモ投入前"),
        )
        .expect("snapshot should record");
        transaction.commit().expect("transaction should commit");

        let versions = load_versions(&connection, project_id).expect("versions should load");
        assert_eq!(versions[0].name.as_deref(), Some("5月試験運用前"));
        assert_eq!(versions[0].memo.as_deref(), Some("実事業メモ投入前"));
        assert!(versions[0].snapshot_json.contains("5月試験運用前"));

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn delete_source_file_removes_rows_and_returns_cleanup_warning() {
        let app_data_dir = temp_app_data_dir("delete-source");
        fs::create_dir_all(&app_data_dir).expect("app data dir should exist");
        let db_path = app_data_dir.join("synergy-map.db");
        crate::init_database(&db_path).expect("db should initialize");
        let connection = open_connection(&db_path).expect("connection should open");
        let project_id = "project-1";
        let source_file_id = "source-1";
        let chunk_id = "chunk-1";
        insert_test_project(&connection, project_id);
        let now = now_rfc3339().expect("time should format");
        let source_parent = source_files_dir(&app_data_dir, project_id);
        let chunk_dir = source_chunks_dir(&app_data_dir, project_id).join(source_file_id);
        fs::create_dir_all(&source_parent).expect("source parent should exist");
        fs::create_dir_all(&chunk_dir).expect("chunk dir should exist");
        let source_file_path = source_parent.join(source_file_id);
        fs::write(&source_file_path, b"not a directory").expect("warning fixture should write");
        let chunk_path = chunk_dir.join("0000.txt");
        fs::write(&chunk_path, "chunk text").expect("chunk should write");
        connection
            .execute(
                "INSERT INTO source_files (
                    id, project_id, file_name, file_type, local_path, file_hash, status,
                    metadata_json, created_at, updated_at
                 ) VALUES (?1, ?2, 'source.md', 'markdown', ?3, 'hash', 'read', '{}', ?4, ?5)",
                params![
                    source_file_id,
                    project_id,
                    source_file_path.display().to_string(),
                    now.as_str(),
                    now.as_str()
                ],
            )
            .expect("source should insert");
        connection
            .execute(
                "INSERT INTO source_chunks (
                    id, project_id, source_file_id, chunk_index, content_path, content_hash,
                    metadata_json, created_at
                 ) VALUES (?1, ?2, ?3, 0, ?4, 'chunk-hash', '{}', ?5)",
                params![
                    chunk_id,
                    project_id,
                    source_file_id,
                    chunk_path.display().to_string(),
                    now.as_str()
                ],
            )
            .expect("chunk should insert");
        drop(connection);

        let result =
            delete_source_file_inner(&db_path, project_id.to_string(), source_file_id.to_string())
                .expect("source should delete");

        let connection = open_connection(&db_path).expect("connection should reopen");
        let source_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM source_files", [], |row| row.get(0))
            .expect("source count should load");
        let chunk_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM source_chunks", [], |row| row.get(0))
            .expect("chunk count should load");

        assert_eq!(source_count, 0);
        assert_eq!(chunk_count, 0);
        assert_eq!(result.workspace.source_files.len(), 0);
        assert!(!result.warnings.is_empty());

        let _ = fs::remove_dir_all(app_data_dir);
    }
}
