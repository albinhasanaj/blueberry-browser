import { ElectronAPI } from "@electron-toolkit/preload";

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

interface AgentToolEvent {
  toolName: string;
  input: Record<string, unknown>;
  status: "started" | "completed" | "error";
  result?: string;
  error?: string;
  stepIndex: number;
  callId: string;
  turnIndex?: number;
}

interface CompanionEvent {
  type: "companion:message" | "companion:thinking" | "companion:done";
  fromId: string;
  fromName: string;
  fromEmoji: string;
  toId?: string;
  toName?: string;
  content: string;
  timestamp: number;
  isFinal?: boolean;
  turnIndex?: number;
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

interface ChatSourcePage {
  tabId: string | null;
  title: string;
  url: string;
  text: string | null;
}

interface ChatLatestRun {
  status: "idle" | "running" | "completed" | "error";
  taskTitle: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  stepCount: number;
  completedStepCount: number;
  errorCount: number;
}

interface ChatHistoryEntry {
  sessionId: string;
  title: string;
  preview: string | null;
  updatedAt: number;
}

interface ChatSessionState {
  sessionId: string;
  sourcePage: ChatSourcePage | null;
  messages: any[];
  toolEvents: AgentToolEvent[];
  companionEvents: CompanionEvent[];
  latestRun: ChatLatestRun;
  sessionTitle: string;
  currentWorkTabId: string | null;
  agentTabIds: string[];
  history: ChatHistoryEntry[];
}

interface SidebarAPI {
  // Chat functionality
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<boolean>;
  getChatSessionState: () => Promise<ChatSessionState>;
  openChatSession: (sessionId: string) => Promise<boolean>;
  onChatSessionUpdated: (callback: (state: ChatSessionState) => void) => void;
  removeChatSessionUpdatedListener: () => void;

  // Agent control
  stopAgent: () => Promise<boolean>;

  // Chat workspace
  createChatTab: (sessionId?: string) => Promise<{ id: string; title: string; url: string } | null>;
  toggleSidebar: () => Promise<boolean>;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  // Tab information
  getActiveTabInfo: () => Promise<TabInfo | null>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}
