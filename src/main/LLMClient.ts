import { WebContents } from "electron";
import type { LanguageModel } from "ai";
import type { Tab } from "./Tab";
import type { Window } from "./Window";
import {
  createModel,
  getModelName,
  getProvider,
  logInitializationStatus,
} from "./agent/modelProvider";
import type {
  ChatHistoryEntry,
  ChatRequest,
  ChatSessionState,
} from "./agent/types";
import { ChatSessionController } from "./chat/ChatSessionController";
import { DEFAULT_SESSION_TITLE, type SessionKind } from "./chat/sessionUtils";
import { CompanionMarketplaceService } from "./companionMarketplace/service";

export class LLMClient {
  private window: Window | null = null;
  private readonly model: LanguageModel | null;
  private readonly marketplaceService = new CompanionMarketplaceService();
  private readonly sessions = new Map<string, ChatSessionController>();
  private readonly listenerSessions = new Map<number, string>();
  private readonly chatTabSessions = new Map<string, string>();
  private readonly chatTabWebContents = new Map<number, string>();
  private readonly cleanupTrackedContents = new Set<number>();
  private sessionCounter = 0;
  private readonly sidebarSessionId: string;

  constructor(sidebarWebContents: WebContents) {
    this.model = this.initializeModel();

    const sidebarSession = this.createSession("sidebar", "sidebar-session");
    this.sidebarSessionId = sidebarSession.id;
    this.attachRendererToSession(sidebarWebContents, sidebarSession.id);
  }

  setWindow(window: Window): void {
    this.window = window;
    for (const session of this.sessions.values()) {
      session.setWindow(window);
    }
  }

  attachChatTab(tab: Tab, sessionId?: string): void {
    const targetSession =
      this.resolveChatSession(sessionId) ?? this.createSession("chat");
    this.bindChatTabToSession(tab, targetSession.id);
  }

  detachChatTab(tabId: string, wc: WebContents): void {
    const sessionId =
      this.chatTabSessions.get(tabId) ?? this.listenerSessions.get(wc.id);
    if (!sessionId) return;

    this.sessions.get(sessionId)?.detachListener(wc);
    this.chatTabSessions.delete(tabId);
    this.chatTabWebContents.delete(wc.id);
    this.listenerSessions.delete(wc.id);
    this.pruneSessionIfDisposable(sessionId);
  }

  async sendChatMessage(sender: WebContents, request: ChatRequest): Promise<void> {
    await this.getSessionForSender(sender).sendChatMessage(request);
  }

  stopAgent(sender: WebContents): void {
    this.getSessionForSender(sender).stopAgent();
  }

  clearMessages(sender: WebContents): void {
    this.getSessionForSender(sender).clearMessages();
    this.pruneSessionIfDisposable(this.listenerSessions.get(sender.id));
  }

  getSessionState(sender: WebContents): ChatSessionState {
    return this.getSessionForSender(sender).getSessionState();
  }

  openChatSession(sender: WebContents, sessionId: string): boolean {
    const targetSession = this.resolveChatSession(sessionId);
    const tabId = this.chatTabWebContents.get(sender.id);
    if (!targetSession || !tabId) {
      return false;
    }

    const tab = this.window?.getTab(tabId);
    if (!tab || tab.kind !== "chat") {
      return false;
    }

    this.bindChatTabToSession(tab, targetSession.id);
    return true;
  }

  onTabClosed(tabId: string): void {
    for (const session of this.sessions.values()) {
      session.onTabClosed(tabId);
    }
  }

  handleTabActivated(tab: Tab): void {
    if (tab.kind !== "web") return;
    for (const session of this.sessions.values()) {
      session.handleTabActivated(tab);
    }
  }

  getHistoryEntries(excludeSessionId?: string): ChatHistoryEntry[] {
    return Array.from(this.sessions.values())
      .filter(
        (session) =>
          session.kind === "chat" &&
          session.id !== excludeSessionId &&
          session.hasMeaningfulContent(),
      )
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
      .map((session) => session.getSummary());
  }

  notifyHistoryChanged(originSessionId?: string): void {
    for (const session of this.sessions.values()) {
      if (session.id === originSessionId) continue;
      session.broadcastSessionState();
    }
  }

  syncChatSessionTitle(sessionId: string, title: string): void {
    if (!this.window) return;

    for (const [tabId, mappedSessionId] of this.chatTabSessions.entries()) {
      if (mappedSessionId !== sessionId) continue;
      this.window.setTabTitle(tabId, title);
    }
  }

  private initializeModel(): LanguageModel | null {
    const provider = getProvider();
    const modelName = getModelName(provider);
    const model = createModel(provider, modelName);
    logInitializationStatus(provider, modelName, model);
    return model;
  }

  private createSession(kind: SessionKind, id?: string): ChatSessionController {
    const sessionId = id ?? `session-${++this.sessionCounter}`;
    const session = new ChatSessionController(
      this,
      sessionId,
      kind,
      this.model,
      this.marketplaceService,
    );
    if (this.window) {
      session.setWindow(this.window);
    }
    this.sessions.set(sessionId, session);
    return session;
  }

  get marketplace(): CompanionMarketplaceService {
    return this.marketplaceService;
  }

  private resolveChatSession(sessionId?: string): ChatSessionController | null {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session || session.kind !== "chat") return null;
    return session;
  }

  private attachRendererToSession(wc: WebContents, sessionId: string): void {
    const currentSessionId = this.listenerSessions.get(wc.id);
    if (currentSessionId && currentSessionId !== sessionId) {
      this.sessions.get(currentSessionId)?.detachListener(wc);
    }

    this.listenerSessions.set(wc.id, sessionId);
    this.sessions.get(sessionId)?.attachListener(wc);
    this.registerCleanupHandler(wc);
  }

  private bindChatTabToSession(tab: Tab, sessionId: string): void {
    const previousSessionId = this.chatTabSessions.get(tab.id);
    if (
      previousSessionId === sessionId &&
      this.listenerSessions.get(tab.webContents.id) === sessionId
    ) {
      this.sessions.get(sessionId)?.sendSessionStateTo(tab.webContents);
      this.syncChatSessionTitle(
        sessionId,
        this.sessions.get(sessionId)?.title ?? DEFAULT_SESSION_TITLE,
      );
      return;
    }

    if (previousSessionId) {
      this.sessions.get(previousSessionId)?.detachListener(tab.webContents);
    }

    this.chatTabSessions.set(tab.id, sessionId);
    this.chatTabWebContents.set(tab.webContents.id, tab.id);
    this.attachRendererToSession(tab.webContents, sessionId);
    this.syncChatSessionTitle(
      sessionId,
      this.sessions.get(sessionId)?.title ?? DEFAULT_SESSION_TITLE,
    );

    if (previousSessionId && previousSessionId !== sessionId) {
      this.pruneSessionIfDisposable(previousSessionId);
    }
  }

  private getSessionForSender(sender: WebContents): ChatSessionController {
    const sessionId =
      this.listenerSessions.get(sender.id) ?? this.sidebarSessionId;
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No chat session found for renderer ${sender.id}`);
    }
    return session;
  }

  private pruneSessionIfDisposable(sessionId?: string): void {
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session || session.kind !== "chat") return;
    if (session.hasListeners() || session.hasMeaningfulContent()) return;

    this.sessions.delete(sessionId);
    this.notifyHistoryChanged();
  }

  private registerCleanupHandler(wc: WebContents): void {
    if (this.cleanupTrackedContents.has(wc.id)) return;

    this.cleanupTrackedContents.add(wc.id);
    wc.once("destroyed", () => {
      const tabId = this.chatTabWebContents.get(wc.id);
      const sessionId = this.listenerSessions.get(wc.id);
      if (sessionId) {
        this.sessions.get(sessionId)?.detachListener(wc);
      }
      if (tabId) {
        this.chatTabSessions.delete(tabId);
      }
      this.chatTabWebContents.delete(wc.id);
      this.listenerSessions.delete(wc.id);
      this.cleanupTrackedContents.delete(wc.id);
      this.pruneSessionIfDisposable(sessionId);
    });
  }
}
