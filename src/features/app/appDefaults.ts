import { SIDEBAR_DEFAULT_WIDTH } from "@/features/app/sidebarLayout";
import type {
  AiSettings,
  DeviceCodeLoginResult,
  MapUiPreferences,
} from "@/lib/mvp1Types";

export const AI_LENS_PANEL_DEFAULT_WIDTH = 360;
const AI_LENS_PANEL_MIN_WIDTH = 320;
const AI_LENS_PANEL_MAX_WIDTH = 560;

export const AI_LENS_PANEL_WIDTH_STORAGE_KEY = "synergy-map.aiLensPanelWidth";

export const contextPanelTabs: Array<{
  id: MapUiPreferences["contextPanelTab"];
  label: string;
}> = [
  { id: "materials", label: "材料" },
  { id: "checks", label: "確認" },
  { id: "actions", label: "一手" },
  { id: "records", label: "記録" },
];

export function clampAiLensPanelWidth(width: number | null | undefined) {
  if (!Number.isFinite(width)) return AI_LENS_PANEL_DEFAULT_WIDTH;
  return Math.min(
    AI_LENS_PANEL_MAX_WIDTH,
    Math.max(AI_LENS_PANEL_MIN_WIDTH, Math.round(width ?? AI_LENS_PANEL_DEFAULT_WIDTH)),
  );
}

export const defaultAiSettings = (): AiSettings => ({
  primaryProvider: "codex",
  fallbackEnabled: true,
  cursorModelId: "composer-2.5",
  defaultExportDir: null,
  mapUiPreferences: {
    showInfluence: true,
    layoutLocked: false,
    contextPanelOpen: false,
    contextPanelTab: "materials",
    aiLensOpen: false,
    sidebarMode: "auto",
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  },
});

export function emptyDeviceCodeResult(): DeviceCodeLoginResult {
  return {
    ok: false,
    loginId: null,
    verificationUrl: null,
    userCode: null,
    completionSuccess: null,
    cancelStatus: null,
    events: [],
    stderr: [],
    errors: [],
    warnings: [],
  };
}
