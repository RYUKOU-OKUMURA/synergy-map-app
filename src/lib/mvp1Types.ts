export type Project = {
  id: string;
  name: string;
  clientName: string | null;
  industry: string | null;
  description: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type SourceFileRow = {
  id: string;
  projectId: string;
  fileName: string;
  fileType: string;
  localPath: string;
  fileHash: string | null;
  status: string;
  metadataJson: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SourceChunkRow = {
  id: string;
  projectId: string;
  sourceFileId: string;
  fileName: string;
  chunkIndex: number;
  contentPath: string;
  contentPreview: string;
  contentHash: string;
  pageNumber: number | null;
  sheetName: string | null;
  rowStart: number | null;
  rowEnd: number | null;
  columnStart: number | null;
  columnEnd: number | null;
  headingPath: string | null;
  metadataJson: string;
  createdAt: string;
};

export type ItemSourceRow = {
  id: string;
  extractedItemId: string;
  sourceFileId: string | null;
  sourceChunkId: string | null;
  sourceFileName: string | null;
  quote: string | null;
  pageNumber: number | null;
  sheetName: string | null;
  rowStart: number | null;
  rowEnd: number | null;
  headingPath: string | null;
};

export type ExtractedItemRow = {
  id: string;
  projectId: string;
  aiRunId: string | null;
  name: string;
  itemType: string;
  description: string | null;
  confidenceStatus: string;
  impactScore: number;
  subjectiveImportance: number;
  adoptionStatus: string;
  memo: string | null;
  sources: ItemSourceRow[];
  createdAt: string;
  updatedAt: string;
};

export type MapNodeRow = {
  id: string;
  projectId: string;
  extractedItemId: string | null;
  nodeType: string;
  label: string;
  description: string | null;
  influenceLevel: string | null;
  informationRichness: string | null;
  confidenceStatus: string | null;
  badgesJson: string;
  positionJson: string;
  adoptionStatus: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MapEdgeRow = {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: string;
  flowType: string | null;
  strength: string | null;
  direction: string | null;
  confidenceStatus: string | null;
  evidence: string | null;
  note: string | null;
  label: string | null;
  adoptionStatus: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SuggestionRow = {
  id: string;
  projectId: string;
  aiRunId: string | null;
  title: string;
  description: string;
  priority: string;
  adoptionStatus: string;
  rationale: string | null;
  relatedNodeIdsJson: string;
  expectedRevenueImpact: string;
  expectedProfitImpact: string;
  costLevel: string;
  effortLevel: string;
  timeToImpact: string;
  confidenceStatus: string;
  impactScore: number;
  evidence: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiCommentRow = {
  id: string;
  projectId: string;
  aiRunId: string | null;
  commentType: string;
  title: string;
  body: string;
  confidenceStatus: string;
  createdAt: string;
};

export type AiRunRow = {
  id: string;
  projectId: string;
  codexThreadId: string | null;
  runType: string;
  schemaName: string | null;
  schemaVersion: string | null;
  model: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  requestSummaryPath: string | null;
  responseJsonPath: string | null;
  createdAt: string;
};

export type ExportJobRow = {
  id: string;
  projectId: string;
  exportType: string;
  status: string;
  outputPath: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type VersionRow = {
  id: string;
  projectId: string;
  versionType: string;
  name: string | null;
  memo: string | null;
  snapshotJson: string;
  createdAt: string;
};

export type ViewLayoutRow = {
  id: string;
  projectId: string;
  viewId: string;
  layoutJson: string;
  createdAt: string;
  updatedAt: string;
};

export type ActionItemRow = {
  id: string;
  projectId: string;
  aiRunId: string | null;
  sourceType: string;
  sourceId: string | null;
  title: string;
  body: string;
  status: "open" | "done" | "dismissed";
  priority: "low" | "medium" | "high";
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type MapNoteRow = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  noteType: "thought" | "meeting" | "daily";
  createdAt: string;
  updatedAt: string;
};

export type ProjectWorkspace = {
  centerNodeId: string | null;
  sourceFiles: SourceFileRow[];
  sourceChunks: SourceChunkRow[];
  extractedItems: ExtractedItemRow[];
  nodes: MapNodeRow[];
  edges: MapEdgeRow[];
  suggestions: SuggestionRow[];
  aiComments: AiCommentRow[];
  aiRuns: AiRunRow[];
  exportJobs: ExportJobRow[];
  versions: VersionRow[];
  viewLayouts: ViewLayoutRow[];
  actionItems: ActionItemRow[];
  mapNotes: MapNoteRow[];
};

export type AiProviderKind = "codex" | "cursor";

export type AiSettings = {
  primaryProvider: AiProviderKind;
  fallbackEnabled: boolean;
  cursorModelId: string;
  defaultExportDir: string | null;
  mapUiPreferences: MapUiPreferences;
};

export type MapUiPreferences = {
  bottomDrawerOpen: boolean;
  bottomDrawerHeight: number;
  showInfluence: boolean;
  layoutLocked: boolean;
  drawerSort: "relevance" | "priority" | "newest";
  showOpenQuestionsOnly: boolean;
};

export type CursorSdkStatus = {
  apiKeyConfigured: boolean;
  pnpmAvailable: boolean;
  tsxAvailable: boolean;
  repoRoot: string | null;
  scriptExists: boolean;
};

export type CursorSdkSmokeResult = {
  ok: boolean;
  durationMs: number;
  model: string | null;
  errors: string[];
};

export type CodexRuntimeInfo = {
  commandStrategy: string;
  resolvedPath: string | null;
  realPath: string | null;
  version: string | null;
  targetTriple: string | null;
  sidecarCandidateName: string | null;
  frontendShellPermissions: string;
  distributionDecision: string;
  warnings: string[];
};

export type CodexUiEvent = {
  kind: string;
  label: string;
  detail: string | null;
  verificationUrl: string | null;
  userCode: string | null;
  completionSuccess: boolean | null;
  cancelStatus: string | null;
};

export type CodexSmokeResult = {
  ok: boolean;
  userAgent: string | null;
  platformOs: string | null;
  authenticated: boolean;
  accountType: string | null;
  requiresOpenaiAuth: boolean;
  threadId: string | null;
  turnId: string | null;
  assistantText: string;
  events: CodexUiEvent[];
  stderr: string[];
  errors: string[];
};

export type DeviceCodeLoginResult = {
  ok: boolean;
  loginId: string | null;
  verificationUrl: string | null;
  userCode: string | null;
  completionSuccess: boolean | null;
  cancelStatus: string | null;
  events: CodexUiEvent[];
  stderr: string[];
  errors: string[];
  warnings: string[];
};

export type MvpRunResult = {
  ok: boolean;
  aiRunId: string | null;
  message: string;
  workspace: ProjectWorkspace;
};

export type ExportResult = {
  ok: boolean;
  exportJob: ExportJobRow;
  warning: string | null;
  workspace: ProjectWorkspace;
};

export type DeleteSourceResult = {
  workspace: ProjectWorkspace;
  warnings: string[];
};

export type SelectedMapElement =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;
