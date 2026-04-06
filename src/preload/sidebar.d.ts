import { ElectronAPI } from "@electron-toolkit/preload";
import type { ChatSessionState } from "@common/types/chatSession";

interface ChatRequest {
  message: string;
  context?: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  kind: "chat" | "web";
  isAgentControlled: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

interface SidebarAPI {
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<boolean>;
  getChatSessionState: () => Promise<ChatSessionState>;
  openChatSession: (sessionId: string) => Promise<boolean>;
  onChatSessionUpdated: (callback: (state: ChatSessionState) => void) => void;
  removeChatSessionUpdatedListener: () => void;
  stopAgent: () => Promise<boolean>;
  createChatTab: (
    sessionId?: string,
  ) => Promise<{ id: string; title: string; url: string } | null>;
  toggleSidebar: () => Promise<boolean>;
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;
  getActiveTabInfo: () => Promise<TabInfo | null>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}
