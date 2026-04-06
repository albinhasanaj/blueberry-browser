import {
  injectOverlay,
  formatToolAction,
  updateOverlayAction,
} from "../../agent/pageOverlay";
import type { AgentToolEvent } from "../../agent/types";
import { OverlayManager } from "../overlayManager";
import { TabTracker } from "../tabTracker";

export function syncOverlayForToolEvent(params: {
  toolName: string;
  input: Record<string, unknown>;
  status: AgentToolEvent["status"];
  tabs: TabTracker;
  overlay: OverlayManager;
  activeCompanionName: string;
  stopAgent: () => void;
  isRunActive: () => boolean;
}): void {
  const tab = params.tabs.getCurrentWorkTab();
  if (!tab || tab.isNewTab) return;

  if (params.status === "started") {
    const actionText = formatToolAction(params.toolName, params.input);
    updateOverlayAction(
      tab.webContents,
      actionText,
      params.activeCompanionName,
    ).catch(() => {});
    params.overlay.setupStopHandler(tab.webContents, () => {
      params.stopAgent();
      params.overlay.cleanup();
    });
    return;
  }

  if (params.status !== "completed") return;

  const isNavigationTool =
    params.toolName === "navigate" || params.toolName === "open_tab";
  if (!isNavigationTool) return;

  const companionName = params.activeCompanionName;
  const webContents = tab.webContents;

  const reinject = (): void => {
    if (!params.isRunActive()) return;

    injectOverlay(webContents, "Working\u2026", companionName).catch(() => {});
    params.overlay.setupStopHandler(webContents, () => {
      params.stopAgent();
      params.overlay.cleanup();
    });
  };

  webContents.once("did-finish-load", reinject);
}
