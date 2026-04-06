import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import type {
  BuilderAssistantResult,
  BuilderPatch,
  CatalogCompanion,
  CompanionCatalogSnapshot,
  CompanionPreviewRequest,
  CompanionPreviewResult,
  CompanionSearchResult,
  PublishedCompanion,
} from "../shared/companionMarketplace";

// Newtab exposes the same sidebarAPI shape so that ChatContext works unchanged.
// Both use identical IPC channels — the main process broadcasts to all listeners.
const sidebarAPI = {
  // Chat functionality
  sendChatMessage: (request: { message: string; messageId: string }) =>
    electronAPI.ipcRenderer.invoke("sidebar-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("sidebar-clear-chat"),

  getChatSessionState: () =>
    electronAPI.ipcRenderer.invoke("sidebar-get-chat-session"),

  openChatSession: (sessionId: string) =>
    electronAPI.ipcRenderer.invoke("sidebar-open-chat-session", sessionId),

  onChatSessionUpdated: (callback: (state: unknown) => void) => {
    electronAPI.ipcRenderer.on("chat-session-updated", (_, state) =>
      callback(state),
    );
  },

  removeChatSessionUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-session-updated");
  },

  // Agent control
  stopAgent: () => electronAPI.ipcRenderer.invoke("agent-stop"),

  // Chat workspace
  createChatTab: (sessionId?: string) =>
    electronAPI.ipcRenderer.invoke(
      "create-tab",
      sessionId ? { kind: "chat", sessionId } : undefined,
    ),

  // Page content access (returns null from newtab context, but needed for interface compat)
  getPageContent: () => electronAPI.ipcRenderer.invoke("get-page-content"),
  getPageText: () => electronAPI.ipcRenderer.invoke("get-page-text"),
  getCurrentUrl: () => electronAPI.ipcRenderer.invoke("get-current-url"),

  // Tab information
  getActiveTabInfo: () => electronAPI.ipcRenderer.invoke("get-active-tab-info"),
};

const companionAPI = {
  listCompanions: () =>
    electronAPI.ipcRenderer.invoke("companion-list") as Promise<CompanionCatalogSnapshot>,
  searchCompanions: (query: string) =>
    electronAPI.ipcRenderer.invoke(
      "companion-search",
      query,
    ) as Promise<CompanionSearchResult[]>,
  getCompanion: (companionId: string) =>
    electronAPI.ipcRenderer.invoke(
      "companion-get",
      companionId,
    ) as Promise<CatalogCompanion | null>,
  createDraftCompanion: () =>
    electronAPI.ipcRenderer.invoke("companion-create-draft"),
  updateDraftCompanion: (companionId: string, patch: BuilderPatch) =>
    electronAPI.ipcRenderer.invoke(
      "companion-update-draft",
      companionId,
      patch,
    ),
  chatCompanionBuilder: (companionId: string, message: string) =>
    electronAPI.ipcRenderer.invoke(
      "companion-builder-chat",
      companionId,
      message,
    ) as Promise<BuilderAssistantResult>,
  previewCompanionDraft: (input: CompanionPreviewRequest) =>
    electronAPI.ipcRenderer.invoke(
      "companion-preview-draft",
      input,
    ) as Promise<CompanionPreviewResult>,
  publishCompanionDraft: (companionId: string) =>
    electronAPI.ipcRenderer.invoke(
      "companion-publish-draft",
      companionId,
    ) as Promise<PublishedCompanion>,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
    contextBridge.exposeInMainWorld("companionAPI", companionAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
  // @ts-ignore (define in dts)
  window.companionAPI = companionAPI;
}
