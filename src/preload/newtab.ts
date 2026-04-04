import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

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

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
