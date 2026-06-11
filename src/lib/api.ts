import { invoke } from "@tauri-apps/api/core";

import type {
  ActionItemRow,
  AiSettings,
  CodexRuntimeInfo,
  CodexSmokeResult,
  CursorSdkSmokeResult,
  CursorSdkStatus,
  DeleteSourceResult,
  DeviceCodeLoginResult,
  ExportResult,
  ExtractedItemRow,
  MapNoteRow,
  MvpRunResult,
  Project,
  ProjectWorkspace,
} from "@/lib/mvp1Types";

export type ImportSourceResult = {
  sourceFileId: string;
  fileName: string;
  fileType: string;
  status: string;
  error: string | null;
  chunkCount: number;
  chunks: unknown[];
};

export type ProjectValues = {
  name: string;
  clientName: string;
  industry: string;
  description: string;
  memo: string;
};

export type OnboardingBriefValues = {
  companyName: string;
  purposeId: string;
  purposeLabel: string;
  industry: string | null;
  memo: string | null;
  websiteUrls: string[];
  snsUrls: string[];
  productInfo: string | null;
};

export type InformationSourceValues = {
  sourceKind: string;
  title: string | null;
  body: string | null;
  url: string | null;
};

export type MapPositionInput = {
  nodeId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type CreateActionItemValues = {
  title: string;
  body: string;
  priority: ActionItemRow["priority"];
  memo: string | null;
};

export type UpdateActionItemValues = CreateActionItemValues & {
  status: ActionItemRow["status"];
};

export type MapNoteValues = {
  title: string;
  body: string;
  noteType: MapNoteRow["noteType"];
};

export type ExtractedItemValues = {
  name: string;
  itemType: string;
  description: string | null;
  confidenceStatus: string;
  impactScore: number;
  subjectiveImportance: number;
  adoptionStatus: string;
  memo: string | null;
};

export type MapNodeValues = {
  label: string;
  nodeType: string;
  description: string | null;
  confidenceStatus: string;
  influenceLevel: string | null;
  informationRichness: string | null;
  adoptionStatus: string;
  memo: string | null;
};

export type MapEdgeValues = {
  label: string | null;
  flowType: string | null;
  strength: string | null;
  confidenceStatus: string | null;
  edgeType: string;
  adoptionStatus: string;
  note: string | null;
};

export type SuggestionValues = {
  title: string;
  description: string;
  priority: string;
  adoptionStatus: string;
  rationale: string | null;
  expectedRevenueImpact: string;
  expectedProfitImpact: string;
  costLevel: string;
  effortLevel: string;
  timeToImpact: string;
  confidenceStatus: string;
  impactScore: number;
  evidence: string | null;
  memo: string | null;
};

function call<T>(command: string, args?: Record<string, unknown>) {
  return invoke<T>(command, args);
}

export const api = {
  listProjects() {
    return call<Project[]>("list_projects");
  },
  createProject(values: ProjectValues) {
    return call<Project>("create_project", {
      name: values.name,
      clientName: values.clientName,
      industry: values.industry,
      description: values.description,
      memo: values.memo,
    });
  },
  updateProject(projectId: string, values: ProjectValues) {
    return call<ProjectWorkspace>("update_project", {
      projectId,
      name: values.name,
      clientName: values.clientName,
      industry: values.industry,
      description: values.description,
      memo: values.memo,
    });
  },
  deleteProject(projectId: string) {
    return call<void>("delete_project", { projectId });
  },
  getProjectWorkspace(projectId: string) {
    return call<ProjectWorkspace>("get_project_workspace", { projectId });
  },
  createOnboardingBriefSource(projectId: string, values: OnboardingBriefValues) {
    return call<ProjectWorkspace>("create_onboarding_brief_source", {
      projectId,
      companyName: values.companyName,
      purposeId: values.purposeId,
      purposeLabel: values.purposeLabel,
      industry: values.industry,
      memo: values.memo,
      websiteUrls: values.websiteUrls,
      snsUrls: values.snsUrls,
      productInfo: values.productInfo,
    });
  },
  createTextInformationSource(projectId: string, values: InformationSourceValues) {
    return call<ProjectWorkspace>("create_text_information_source", {
      projectId,
      sourceKind: values.sourceKind,
      title: values.title,
      body: values.body,
      url: values.url,
    });
  },
  deleteSourceFile(projectId: string, sourceFileId: string) {
    return call<DeleteSourceResult>("delete_source_file", { projectId, sourceFileId });
  },
  importSourceFiles(projectId: string, paths: string[]) {
    return call<ImportSourceResult[]>("import_source_files", { projectId, paths });
  },
  importSourceFilesFromDialog(projectId: string) {
    return call<ImportSourceResult[]>("import_source_files_from_dialog", { projectId });
  },
  runExtractItems(projectId: string, sourceChunkIds?: string[]) {
    return call<MvpRunResult>("run_extract_items", { projectId, sourceChunkIds });
  },
  createExtractedItem(
    projectId: string,
    values: Pick<ExtractedItemRow, "name" | "itemType"> & {
      description: string | null;
    },
  ) {
    return call<ProjectWorkspace>("create_extracted_item", {
      projectId,
      name: values.name,
      itemType: values.itemType,
      description: values.description,
    });
  },
  updateExtractedItem(projectId: string, itemId: string, values: ExtractedItemValues) {
    return call<ProjectWorkspace>("update_extracted_item", {
      projectId,
      itemId,
      name: values.name,
      itemType: values.itemType,
      description: values.description,
      confidenceStatus: values.confidenceStatus,
      impactScore: values.impactScore,
      subjectiveImportance: values.subjectiveImportance,
      adoptionStatus: values.adoptionStatus,
      memo: values.memo,
    });
  },
  generateMapFromItems(projectId: string) {
    return call<MvpRunResult>("generate_map_from_items", { projectId });
  },
  updateMapNode(projectId: string, nodeId: string, values: MapNodeValues) {
    return call<ProjectWorkspace>("update_map_node", {
      projectId,
      nodeId,
      label: values.label,
      nodeType: values.nodeType,
      description: values.description,
      confidenceStatus: values.confidenceStatus,
      influenceLevel: values.influenceLevel,
      informationRichness: values.informationRichness,
      adoptionStatus: values.adoptionStatus,
      memo: values.memo,
    });
  },
  updateMapEdge(projectId: string, edgeId: string, values: MapEdgeValues) {
    return call<ProjectWorkspace>("update_map_edge", {
      projectId,
      edgeId,
      label: values.label,
      flowType: values.flowType,
      strength: values.strength,
      confidenceStatus: values.confidenceStatus,
      edgeType: values.edgeType,
      adoptionStatus: values.adoptionStatus,
      note: values.note,
    });
  },
  createMapEdge(projectId: string, sourceNodeId: string, targetNodeId: string) {
    return call<ProjectWorkspace>("create_map_edge", {
      projectId,
      sourceNodeId,
      targetNodeId,
    });
  },
  saveMapLayout(projectId: string, positions: MapPositionInput[]) {
    return call<ProjectWorkspace>("save_map_layout", { projectId, positions });
  },
  saveViewLayout(projectId: string, viewId: string, positions: MapPositionInput[]) {
    return call<ProjectWorkspace>("save_view_layout", { projectId, viewId, positions });
  },
  setProjectCenterNode(projectId: string, nodeId: string | null) {
    return call<ProjectWorkspace>("set_project_center_node", { projectId, nodeId });
  },
  generateSuggestionsFromMap(projectId: string) {
    return call<MvpRunResult>("generate_suggestions_from_map", { projectId });
  },
  generateAiLensFromMap(projectId: string) {
    return call<MvpRunResult>("generate_ai_lens_from_map", { projectId });
  },
  askMapInsight(
    projectId: string,
    targetKind: "map" | "node" | "edge",
    targetId: string | null,
    questionType: string,
  ) {
    return call<MvpRunResult>("ask_map_insight", {
      projectId,
      targetKind,
      targetId,
      questionType,
    });
  },
  askAiLensInsight(projectId: string, aiLensItemId: string, questionText: string) {
    return call<MvpRunResult>("ask_ai_lens_insight", {
      projectId,
      aiLensItemId,
      questionText,
    });
  },
  deleteAiLensInsightComment(projectId: string, commentId: string) {
    return call<ProjectWorkspace>("delete_ai_lens_insight_comment", {
      projectId,
      commentId,
    });
  },
  updateSuggestion(projectId: string, suggestionId: string, values: SuggestionValues) {
    return call<ProjectWorkspace>("update_suggestion", {
      projectId,
      suggestionId,
      title: values.title,
      description: values.description,
      priority: values.priority,
      adoptionStatus: values.adoptionStatus,
      rationale: values.rationale,
      expectedRevenueImpact: values.expectedRevenueImpact,
      expectedProfitImpact: values.expectedProfitImpact,
      costLevel: values.costLevel,
      effortLevel: values.effortLevel,
      timeToImpact: values.timeToImpact,
      confidenceStatus: values.confidenceStatus,
      impactScore: values.impactScore,
      evidence: values.evidence,
      memo: values.memo,
    });
  },
  createActionItem(projectId: string, values: CreateActionItemValues) {
    return call<ProjectWorkspace>("create_action_item", {
      projectId,
      title: values.title,
      body: values.body,
      priority: values.priority,
      memo: values.memo,
    });
  },
  updateActionItem(
    projectId: string,
    actionItemId: string,
    values: UpdateActionItemValues,
  ) {
    return call<ProjectWorkspace>("update_action_item", {
      projectId,
      actionItemId,
      title: values.title,
      body: values.body,
      status: values.status,
      priority: values.priority,
      memo: values.memo,
    });
  },
  createActionItemFromSuggestion(projectId: string, suggestionId: string) {
    return call<ProjectWorkspace>("create_action_item_from_suggestion", {
      projectId,
      suggestionId,
    });
  },
  createMapNote(projectId: string, values: MapNoteValues) {
    return call<ProjectWorkspace>("create_map_note", {
      projectId,
      title: values.title,
      body: values.body,
      noteType: values.noteType,
    });
  },
  updateMapNote(projectId: string, noteId: string, values: MapNoteValues) {
    return call<ProjectWorkspace>("update_map_note", {
      projectId,
      noteId,
      title: values.title,
      body: values.body,
      noteType: values.noteType,
    });
  },
  deleteMapNote(projectId: string, noteId: string) {
    return call<ProjectWorkspace>("delete_map_note", { projectId, noteId });
  },
  createNamedVersion(projectId: string, name: string, memo: string | null) {
    return call<ProjectWorkspace>("create_named_version", { projectId, name, memo });
  },
  exportProject(command: "export_markdown" | "export_csv_bundle", projectId: string) {
    return call<ExportResult>(command, { projectId });
  },
  getAiSettings() {
    return call<AiSettings>("get_ai_settings");
  },
  saveAiSettings(settings: AiSettings) {
    return call<AiSettings>("save_ai_settings_command", { settings });
  },
  selectDefaultExportDir() {
    return call<AiSettings>("select_default_export_dir");
  },
  getCodexRuntimeInfo() {
    return call<CodexRuntimeInfo>("get_codex_runtime_info");
  },
  runCodexSmokeTest() {
    return call<CodexSmokeResult>("run_codex_smoke_test");
  },
  runCodexDeviceCodeCheck() {
    return call<DeviceCodeLoginResult>("run_codex_device_code_check");
  },
  getCursorSdkStatus() {
    return call<CursorSdkStatus>("get_cursor_sdk_status");
  },
  runCursorSdkSmokeTest() {
    return call<CursorSdkSmokeResult>("run_cursor_sdk_smoke_test");
  },
  openExternalUrl(url: string) {
    return call<void>("open_external_url", { url });
  },
  openExportPath(path: string) {
    return call<void>("open_export_path", { path });
  },
};

export type ApiClient = typeof api;
