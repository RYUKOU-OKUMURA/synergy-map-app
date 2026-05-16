export type Project = {
  id: string;
  name: string;
  clientName: string | null;
  industry: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type StorageInfo = {
  dbPath: string;
  appDataDir: string;
};

export type SourceChunk = {
  id: string;
  chunkIndex: number;
  contentPath: string;
  pageNumber: number | null;
  sheetName: string | null;
  rowStart: number | null;
  rowEnd: number | null;
  headingPath: string | null;
};

export type ImportSourceResult = {
  sourceFileId: string;
  fileName: string;
  fileType: string;
  status: string;
  error: string | null;
  chunkCount: number;
  chunks: SourceChunk[];
};

export type CodexUiEvent = {
  kind: string;
  label: string;
  detail: string | null;
  verificationUrl: string | null;
  userCode: string | null;
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

export type AiSchemaPocResult = {
  ok: boolean;
  aiRunId: string | null;
  schemaName: string;
  schemaVersion: string;
  responseSummary: string | null;
  requestSummaryPath: string | null;
  responseJsonPath: string | null;
  errors: string[];
};

export type MapExportInfo = {
  fileName: string;
  width: number;
  height: number;
  bytes: number;
};
