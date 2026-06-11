use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFileRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) file_name: String,
    pub(crate) file_type: String,
    pub(crate) local_path: String,
    pub(crate) file_hash: Option<String>,
    pub(crate) status: String,
    pub(crate) metadata_json: String,
    pub(crate) chunk_count: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceChunkRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) source_file_id: String,
    pub(crate) file_name: String,
    pub(crate) chunk_index: i64,
    pub(crate) content_path: String,
    pub(crate) content_preview: String,
    pub(crate) content_hash: String,
    pub(crate) page_number: Option<i64>,
    pub(crate) sheet_name: Option<String>,
    pub(crate) row_start: Option<i64>,
    pub(crate) row_end: Option<i64>,
    pub(crate) column_start: Option<i64>,
    pub(crate) column_end: Option<i64>,
    pub(crate) heading_path: Option<String>,
    pub(crate) metadata_json: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSourceRow {
    pub(crate) id: String,
    pub(crate) extracted_item_id: String,
    pub(crate) source_file_id: Option<String>,
    pub(crate) source_chunk_id: Option<String>,
    pub(crate) source_file_name: Option<String>,
    pub(crate) quote: Option<String>,
    pub(crate) page_number: Option<i64>,
    pub(crate) sheet_name: Option<String>,
    pub(crate) row_start: Option<i64>,
    pub(crate) row_end: Option<i64>,
    pub(crate) heading_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItemRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) ai_run_id: Option<String>,
    pub(crate) name: String,
    pub(crate) item_type: String,
    pub(crate) description: Option<String>,
    pub(crate) confidence_status: String,
    pub(crate) impact_score: i64,
    pub(crate) subjective_importance: i64,
    pub(crate) adoption_status: String,
    pub(crate) memo: Option<String>,
    pub(crate) sources: Vec<ItemSourceRow>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapNodeRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) extracted_item_id: Option<String>,
    pub(crate) node_type: String,
    pub(crate) label: String,
    pub(crate) description: Option<String>,
    pub(crate) influence_level: Option<String>,
    pub(crate) information_richness: Option<String>,
    pub(crate) confidence_status: Option<String>,
    pub(crate) badges_json: String,
    pub(crate) position_json: String,
    pub(crate) adoption_status: String,
    pub(crate) memo: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEdgeRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) source_node_id: String,
    pub(crate) target_node_id: String,
    pub(crate) edge_type: String,
    pub(crate) flow_type: Option<String>,
    pub(crate) strength: Option<String>,
    pub(crate) direction: Option<String>,
    pub(crate) confidence_status: Option<String>,
    pub(crate) evidence: Option<String>,
    pub(crate) note: Option<String>,
    pub(crate) label: Option<String>,
    pub(crate) adoption_status: String,
    pub(crate) priority: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) ai_run_id: Option<String>,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) priority: String,
    pub(crate) adoption_status: String,
    pub(crate) rationale: Option<String>,
    pub(crate) related_node_ids_json: String,
    pub(crate) expected_revenue_impact: String,
    pub(crate) expected_profit_impact: String,
    pub(crate) cost_level: String,
    pub(crate) effort_level: String,
    pub(crate) time_to_impact: String,
    pub(crate) confidence_status: String,
    pub(crate) impact_score: i64,
    pub(crate) evidence: Option<String>,
    pub(crate) memo: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCommentRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) ai_run_id: Option<String>,
    pub(crate) comment_type: String,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) confidence_status: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLensItemRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) ai_run_id: Option<String>,
    pub(crate) category: String,
    pub(crate) target_kind: String,
    pub(crate) target_id: Option<String>,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) confidence_status: String,
    pub(crate) evidence: String,
    pub(crate) follow_up_question: Option<String>,
    pub(crate) sort_order: i64,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) codex_thread_id: Option<String>,
    pub(crate) run_type: String,
    pub(crate) schema_name: Option<String>,
    pub(crate) schema_version: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) status: String,
    pub(crate) started_at: Option<String>,
    pub(crate) completed_at: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) request_summary_path: Option<String>,
    pub(crate) response_json_path: Option<String>,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) export_type: String,
    pub(crate) status: String,
    pub(crate) output_path: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) created_at: String,
    pub(crate) completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) version_type: String,
    pub(crate) name: Option<String>,
    pub(crate) memo: Option<String>,
    pub(crate) snapshot_json: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewLayoutRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) view_id: String,
    pub(crate) layout_json: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionItemRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) ai_run_id: Option<String>,
    pub(crate) source_type: String,
    pub(crate) source_id: Option<String>,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) status: String,
    pub(crate) priority: String,
    pub(crate) memo: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapNoteRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) note_type: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspace {
    pub(crate) center_node_id: Option<String>,
    pub(crate) source_files: Vec<SourceFileRow>,
    pub(crate) source_chunks: Vec<SourceChunkRow>,
    pub(crate) extracted_items: Vec<ExtractedItemRow>,
    pub(crate) nodes: Vec<MapNodeRow>,
    pub(crate) edges: Vec<MapEdgeRow>,
    pub(crate) suggestions: Vec<SuggestionRow>,
    pub(crate) ai_comments: Vec<AiCommentRow>,
    pub(crate) ai_lens_items: Vec<AiLensItemRow>,
    pub(crate) ai_runs: Vec<AiRunRow>,
    pub(crate) export_jobs: Vec<ExportJobRow>,
    pub(crate) versions: Vec<VersionRow>,
    pub(crate) view_layouts: Vec<ViewLayoutRow>,
    pub(crate) action_items: Vec<ActionItemRow>,
    pub(crate) map_notes: Vec<MapNoteRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MvpRunResult {
    pub(crate) ok: bool,
    pub(crate) ai_run_id: Option<String>,
    pub(crate) message: String,
    pub(crate) workspace: ProjectWorkspace,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub(crate) ok: bool,
    pub(crate) export_job: ExportJobRow,
    pub(crate) warning: Option<String>,
    pub(crate) workspace: ProjectWorkspace,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSourceResult {
    pub(crate) workspace: ProjectWorkspace,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapPositionInput {
    pub(crate) node_id: String,
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: Option<f64>,
    pub(crate) height: Option<f64>,
}
