import { WebContents } from "electron";
import {
  type CoreMessage,
  type LanguageModel,
} from "ai";
import type { Tab } from "../Tab";
import { type BrowserToolDeps } from "../agent/browserTools";

import {
  injectOverlay,
  formatToolAction,
  updateOverlayAction,
} from "../agent/pageOverlay";

import { endTraceRun, startTraceRun, trace } from "../agent/traceLogger";
import {
  type AgentToolEvent,
  type ChatHistoryEntry,
  type ChatLatestRun,
  type ChatRequest,
  type ChatSessionState,
  type ChatSourcePage,
  type CompanionEvent,
  SCREENSHOT_JPEG_QUALITY,
} from "../agent/types";
import { runOrchestration } from "../agent/companions/orchestrator";
import {
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
  extractMessageText,
  getErrorMessage,
  createEmptyLatestRun,
  type SessionKind,
} from "./sessionUtils";
import { OverlayManager } from "./overlayManager";
import { TabTracker } from "./tabTracker";

export interface ChatSessionOwner {
  notifyHistoryChanged(originSessionId?: string): void;
  getHistoryEntries(excludeSessionId?: string): ChatHistoryEntry[];
  syncChatSessionTitle(sessionId: string, title: string): void;
}

export class ChatSessionController {
  private readonly tabs = new TabTracker();
  private readonly overlay = new OverlayManager();
  private readonly listeners: Set<WebContents> = new Set();
  private messages: CoreMessage[] = [];
  private toolEvents: AgentToolEvent[] = [];
  private companionEvents: CompanionEvent[] = [];
  private sourcePage: ChatSourcePage | null = null;
  private latestRun: ChatLatestRun = createEmptyLatestRun();
  private sessionTitle = DEFAULT_SESSION_TITLE;
  private abortController: AbortController | null = null;
  private toolStepIndex = 0;
  private turnIndex = -1;
  private updatedAt = Date.now();

  constructor(
    private readonly owner: ChatSessionOwner,
    readonly id: string,
    readonly kind: SessionKind,
    private readonly model: LanguageModel | null,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  setWindow(window: import("../Window").Window): void {
    this.tabs.setWindow(window);
  }

  get title(): string {
    return this.sessionTitle;
  }

  get lastUpdatedAt(): number {
    return this.updatedAt;
  }

  attachListener(wc: WebContents): void {
    this.listeners.add(wc);
    this.sendSessionStateTo(wc);
  }

  detachListener(wc: WebContents): void {
    this.listeners.delete(wc);
  }

  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  hasMeaningfulContent(): boolean {
    return (
      this.messages.length > 0 ||
      this.toolEvents.length > 0 ||
      this.latestRun.status !== "idle"
    );
  }

  getSummary(): ChatHistoryEntry {
    const latestUserMessage = [...this.messages]
      .reverse()
      .find((message) => message.role === "user");
    const latestAssistantMessage = [...this.messages]
      .reverse()
      .find((message) => message.role === "assistant");

    const preview =
      (latestUserMessage && extractMessageText(latestUserMessage.content)) ||
      (latestAssistantMessage &&
        extractMessageText(latestAssistantMessage.content)) ||
      null;

    return {
      sessionId: this.id,
      title: this.sessionTitle,
      preview,
      updatedAt: this.updatedAt,
    };
  }

  stopAgent(): void {
    if (!this.abortController) return;

    this.abortController.abort();
    this.abortController = null;
    if (this.latestRun.status === "running") {
      this.completeRun("completed");
    }
  }

  async sendChatMessage(request: ChatRequest): Promise<void> {
    this.startRun(request.message);

    if (this.tabs.currentWorkTabId) {
      this.tabs.markAsAgentControlled(this.tabs.currentWorkTabId);
    }

    startTraceRun(request.message);
    trace("run", "start", {
      prompt: request.message,
      messageId: request.messageId,
      sessionId: this.id,
    });

    try {
      this.appendUserMessage(await this.createUserMessage(request.message));

      if (!this.model) {
        this.sendErrorMessage(
          "LLM service is not configured. Please add your API key to the .env file.",
        );
        return;
      }

      await this.runCompanionOrchestration(request.message);
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Agent run aborted by user.");
        if (this.latestRun.status === "running") {
          this.completeRun("completed");
        }
        return;
      }

      console.error("Error in LLM request:", error);
      this.handleStreamError(error);
    } finally {
      trace("run", "finished", {
        toolSteps: this.toolStepIndex,
        sessionId: this.id,
      });
      endTraceRun({ totalToolSteps: this.toolStepIndex });
      this.abortController = null;
      this.overlay.cleanup();
      this.broadcastSessionState();
    }
  }

  clearMessages(): void {
    this.stopAgent();
    this.messages = [];
    this.toolEvents = [];
    this.companionEvents = [];
    this.sourcePage = null;
    this.latestRun = createEmptyLatestRun();
    this.sessionTitle = DEFAULT_SESSION_TITLE;
    this.turnIndex = -1;
    this.tabs.clearAll();
    this.touch();
    this.updateChatTabTitles();
    this.broadcastSessionState();
    this.owner.notifyHistoryChanged(this.id);
  }

  getSessionState(): ChatSessionState {
    return {
      sessionId: this.id,
      sourcePage: this.sourcePage ? { ...this.sourcePage } : null,
      messages: [...this.messages],
      toolEvents: [...this.toolEvents],
      companionEvents: [...this.companionEvents],
      latestRun: { ...this.latestRun },
      sessionTitle: this.sessionTitle,
      currentWorkTabId: this.tabs.currentWorkTabId,
      agentTabIds: Array.from(this.tabs.agentTabIds),
      history: this.owner.getHistoryEntries(this.id),
    };
  }

  onTabClosed(tabId: string): void {
    this.sourcePage = this.tabs.handleTabClosed(tabId, this.sourcePage);
    this.broadcastSessionState();
  }

  handleTabActivated(tab: Tab): void {
    if (tab.kind !== "web") return;

    const isTrackedTab =
      this.tabs.agentTabIds.has(tab.id) ||
      this.tabs.currentWorkTabId === tab.id ||
      this.sourcePage?.tabId === tab.id;

    if (!isTrackedTab) return;

    this.tabs.currentWorkTabId = tab.id;
    this.broadcastSessionState();
  }

  broadcastSessionState(): void {
    const state = this.getSessionState();
    for (const wc of this.listeners) {
      try {
        wc.send("chat-session-updated", state);
      } catch {
        this.listeners.delete(wc);
      }
    }
  }

  sendSessionStateTo(wc: WebContents): void {
    try {
      wc.send("chat-session-updated", this.getSessionState());
    } catch {
      this.listeners.delete(wc);
    }
  }

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  private startRun(taskMessage: string): void {
    this.abortController = new AbortController();
    this.toolStepIndex = 0;
    this.turnIndex++;
    this.sessionTitle = deriveSessionTitle(taskMessage);
    this.latestRun = {
      ...createEmptyLatestRun(this.sessionTitle),
      status: "running",
      startedAt: Date.now(),
    };
    this.touch();
    this.updateChatTabTitles();
  }

  private completeRun(status: ChatLatestRun["status"]): void {
    this.latestRun = {
      ...this.latestRun,
      status,
      finishedAt: Date.now(),
    };
    this.touch();
    this.broadcastSessionState();
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  private async createUserMessage(message: string): Promise<CoreMessage> {
    const screenshot = await this.captureScreenshot();
    const userContent: Array<
      { type: "image"; image: string } | { type: "text"; text: string }
    > = [];

    if (screenshot) {
      userContent.push({ type: "image", image: screenshot });
    }
    userContent.push({ type: "text", text: message });

    return {
      role: "user",
      content: userContent.length === 1 ? message : userContent,
    };
  }

  private appendUserMessage(message: CoreMessage): void {
    this.messages.push(message);
    this.touch();
    this.broadcastSessionState();
    this.owner.notifyHistoryChanged(this.id);
  }

  private handleStreamError(error: unknown): void {
    console.error("Error streaming from LLM:", error);
    this.sendErrorMessage(getErrorMessage(error));
  }

  private sendErrorMessage(errorMessage: string): void {
    this.messages.push({
      role: "assistant",
      content: errorMessage,
    });
    this.completeRun("error");
  }

  // ---------------------------------------------------------------------------
  // Companion orchestration
  // ---------------------------------------------------------------------------

  private async runCompanionOrchestration(userMessage: string): Promise<void> {
    // Build conversation history from last 4 messages for context
    const history = this.messages.slice(-4).map((m) => ({
      role: m.role,
      content: extractMessageText(m.content),
    }));

    await runOrchestration({
      userMessage,
      deps: this.createBrowserToolDeps(),
      onCompanionEvent: (event) => {
        this.companionEvents.push({ ...event, turnIndex: this.turnIndex });
        this.touch();
        this.broadcastSessionState();
      },
      onFinalResponse: (text) => {
        this.messages.push({ role: "assistant", content: text });
        this.completeRun("completed");
      },
      abortSignal: this.abortController?.signal,
      conversationHistory: history,
    });
  }

  private createBrowserToolDeps(): BrowserToolDeps {
    return {
      getWorkTab: () => this.tabs.getCurrentWorkTabOrThrow(),
      captureScreenshot: () => this.captureScreenshot(),
      emitToolEvent: (...args) => this.emitToolEvent(...args),
      openTab: (url?: string) => {
        const tab = this.tabs.openAgentTab(url);
        this.broadcastSessionState();
        return tab;
      },
      hasWorkTab: () => this.tabs.getCurrentWorkTab() !== null,
    };
  }

  // ---------------------------------------------------------------------------
  // Tool events
  // ---------------------------------------------------------------------------

  private emitToolEvent(
    toolName: string,
    input: Record<string, unknown>,
    status: AgentToolEvent["status"],
    result?: string,
    error?: string,
    ref?: { stepIndex: number; callId: string },
  ): { stepIndex: number; callId: string } {
    if (status === "started") this.toolStepIndex++;
    const stepIndex = ref?.stepIndex ?? this.toolStepIndex;
    const callId =
      ref?.callId ??
      `${stepIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const event: AgentToolEvent = {
      toolName,
      input,
      status,
      result,
      error,
      stepIndex,
      callId,
      turnIndex: this.turnIndex,
    };

    const existingIndex = this.toolEvents.findIndex(
      (item) => item.callId === callId,
    );
    if (existingIndex >= 0) {
      this.toolEvents[existingIndex] = event;
    } else {
      this.toolEvents.push(event);
    }

    this.latestRun = {
      ...this.latestRun,
      stepCount: this.toolEvents.filter((e) => e.turnIndex === this.turnIndex).length,
      completedStepCount: this.toolEvents.filter(
        (item) => item.turnIndex === this.turnIndex && item.status === "completed",
      ).length,
      errorCount: this.toolEvents.filter(
        (item) => item.turnIndex === this.turnIndex && item.status === "error",
      ).length,
    };
    this.touch();
    this.broadcastSessionState();

    const tab = this.tabs.getCurrentWorkTab();
    if (tab && !tab.isNewTab) {
      if (status === "started") {
        const actionText = formatToolAction(toolName, input);
        updateOverlayAction(tab.webContents, actionText).catch(() => {});
        this.overlay.setupStopHandler(tab.webContents, () => {
          this.stopAgent();
          this.overlay.cleanup();
        });
      } else if (status === "completed") {
        const isNavigationTool = toolName === "navigate" || toolName === "open_tab";
        if (isNavigationTool) {
          const wc = tab.webContents;
          const reinject = (): void => {
            if (this.abortController) {
              injectOverlay(wc, "Working\u2026").catch(() => {});
              this.overlay.setupStopHandler(wc, () => {
                this.stopAgent();
                this.overlay.cleanup();
              });
            }
          };
          wc.once("did-finish-load", reinject);
        }
      }
    }

    return { stepIndex, callId };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async captureScreenshot(): Promise<string | null> {
    const workTab = this.tabs.getCurrentWorkTab();
    if (!workTab || workTab.isNewTab) return null;

    try {
      const image = await workTab.screenshot();
      const jpegBuffer = image.toJPEG(SCREENSHOT_JPEG_QUALITY);
      return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
    } catch (error) {
      // "Current display surface not available" is normal when the tab isn't
      // visible (e.g. minimized, behind another window). Don't log a stack trace.
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("display surface")) {
        console.warn("[screenshot] Display surface unavailable -- skipping");
      } else {
        console.error("Failed to capture screenshot:", error);
      }
      return null;
    }
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }

  private updateChatTabTitles(): void {
    this.owner.syncChatSessionTitle(this.id, this.sessionTitle);
  }
}
