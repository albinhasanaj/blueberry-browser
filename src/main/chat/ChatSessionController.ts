import { WebContents } from "electron";
import { type ModelMessage } from "ai";
import type { Tab } from "../Tab";
import {
  type BrowserToolDeps,
  type ToolCallRef,
} from "../agent/browserToolRuntime";
import type { LLMRouter } from "../agent/llmRouter";
import { endTraceRun, startTraceRun, trace } from "../agent/traceLogger";
import {
  type AgentToolEvent,
  type ChatHistoryEntry,
  type ChatLatestRun,
  type ChatRequest,
  type ChatSessionState,
  type ChatSourcePage,
  type CompanionEvent,
} from "../agent/types";
import { runOrchestration } from "../agent/companions/orchestrator";
import {
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
  getErrorMessage,
  createEmptyLatestRun,
  type SessionKind,
} from "./sessionUtils";
import { OverlayManager } from "./overlayManager";
import { TabTracker } from "./tabTracker";
import { syncOverlayForToolEvent } from "./controller/overlaySync";
import { captureTabScreenshot } from "./controller/screenshot";
import {
  createChatHistorySummary,
  createChatSessionState,
  createConversationHistory,
  createUserMessage as createUserTurnMessage,
  hasMeaningfulSessionContent,
} from "./controller/sessionState";
import {
  applyToolRunProgress,
  createAgentToolEvent,
  createToolCallRef,
  upsertToolEvent,
} from "./controller/toolEvents";
import type { CompanionMarketplaceService } from "../companionMarketplace/service";

export interface ChatSessionOwner {
  notifyHistoryChanged(originSessionId?: string): void;
  getHistoryEntries(excludeSessionId?: string): ChatHistoryEntry[];
  syncChatSessionTitle(sessionId: string, title: string): void;
}

export class ChatSessionController {
  private readonly tabs = new TabTracker();
  private readonly overlay = new OverlayManager();
  private readonly listeners: Set<WebContents> = new Set();
  private messages: ModelMessage[] = [];
  private toolEvents: AgentToolEvent[] = [];
  private companionEvents: CompanionEvent[] = [];
  private sourcePage: ChatSourcePage | null = null;
  private latestRun: ChatLatestRun = createEmptyLatestRun();
  private sessionTitle = DEFAULT_SESSION_TITLE;
  private abortController: AbortController | null = null;
  private toolStepIndex = 0;
  private turnIndex = -1;
  private updatedAt = Date.now();
  private activeCompanionName = "Blueberry";
  private lastOpenAIResponseId: string | null = null;

  constructor(
    private readonly owner: ChatSessionOwner,
    readonly id: string,
    readonly kind: SessionKind,
    private readonly router: LLMRouter,
    private readonly marketplaceService: CompanionMarketplaceService,
  ) {}

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
    return hasMeaningfulSessionContent({
      messages: this.messages,
      toolEvents: this.toolEvents,
      latestRun: this.latestRun,
    });
  }

  getSummary(): ChatHistoryEntry {
    return createChatHistorySummary({
      sessionId: this.id,
      sessionTitle: this.sessionTitle,
      messages: this.messages,
      updatedAt: this.updatedAt,
    });
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
    this.lastOpenAIResponseId = null;
    this.turnIndex = -1;
    this.tabs.clearAll();
    this.touch();
    this.updateChatTabTitles();
    this.broadcastSessionState();
    this.owner.notifyHistoryChanged(this.id);
  }

  getSessionState(): ChatSessionState {
    return createChatSessionState({
      sessionId: this.id,
      sourcePage: this.sourcePage,
      messages: this.messages,
      toolEvents: this.toolEvents,
      companionEvents: this.companionEvents,
      latestRun: this.latestRun,
      sessionTitle: this.sessionTitle,
      currentWorkTabId: this.tabs.currentWorkTabId,
      agentTabIds: this.tabs.agentTabIds,
      history: this.owner.getHistoryEntries(this.id),
      llmProvider: this.router.getActiveRouteInfo().provider,
      llmModel: this.router.getActiveRouteInfo().model,
      lastOpenAIResponseId: this.lastOpenAIResponseId,
    });
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

  private async createUserMessage(message: string): Promise<ModelMessage> {
    const screenshot = await this.captureScreenshot();
    return createUserTurnMessage(message, screenshot);
  }

  private appendUserMessage(message: ModelMessage): void {
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

  private async runCompanionOrchestration(userMessage: string): Promise<void> {
    const history = createConversationHistory(this.messages);
    const routeInfo = this.router.getActiveRouteInfo();

    await runOrchestration({
      userMessage,
      deps: this.createBrowserToolDeps(),
      router: this.router,
      llmProvider: routeInfo.provider,
      llmModel: routeInfo.model,
      previousOpenAIResponseId: this.lastOpenAIResponseId,
      onCompanionEvent: (event) => {
        this.companionEvents.push({ ...event, turnIndex: this.turnIndex });
        this.touch();
        this.broadcastSessionState();
      },
      onFinalResponse: (payload) => {
        this.messages.push({ role: "assistant", content: payload.text });
        this.lastOpenAIResponseId =
          routeInfo.provider === "openai"
            ? payload.responseId ?? null
            : null;
        this.completeRun("completed");
      },
      abortSignal: this.abortController?.signal,
      conversationHistory: history,
      marketplaceService: this.marketplaceService,
    });
  }

  private createBrowserToolDeps(): BrowserToolDeps {
    return {
      getWorkTab: () => this.tabs.getCurrentWorkTabOrThrow(),
      getTabById: (tabId: string) => this.tabs.window?.getTab(tabId) ?? null,
      captureScreenshot: () => this.captureScreenshot(),
      emitToolEvent: (...args) => this.emitToolEvent(...args),
      openTab: (url?: string) => {
        const tab = this.tabs.openAgentTab(url);
        this.broadcastSessionState();
        return tab;
      },
      hasWorkTab: () => this.tabs.getCurrentWorkTab() !== null,
      setActiveCompanion: (companion) => {
        this.activeCompanionName = companion.name;
      },
    };
  }

  private emitToolEvent(
    toolName: string,
    input: Record<string, unknown>,
    status: AgentToolEvent["status"],
    result?: string,
    error?: string,
    ref?: ToolCallRef,
  ): ToolCallRef {
    if (status === "started") {
      this.toolStepIndex++;
    }

    const stepIndex = ref?.stepIndex ?? this.toolStepIndex;
    const callRef = createToolCallRef(stepIndex, ref);
    const event = createAgentToolEvent({
      toolName,
      input,
      status,
      turnIndex: this.turnIndex,
      ref: callRef,
      result,
      error,
    });

    upsertToolEvent(this.toolEvents, event);
    this.latestRun = applyToolRunProgress({
      latestRun: this.latestRun,
      toolEvents: this.toolEvents,
      turnIndex: this.turnIndex,
    });
    this.touch();
    this.broadcastSessionState();

    syncOverlayForToolEvent({
      toolName,
      input,
      status,
      tabs: this.tabs,
      overlay: this.overlay,
      activeCompanionName: this.activeCompanionName,
      stopAgent: () => this.stopAgent(),
      isRunActive: () => this.abortController !== null,
    });

    return callRef;
  }

  private async captureScreenshot(): Promise<string | null> {
    return await captureTabScreenshot(this.tabs.getCurrentWorkTab());
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }

  private updateChatTabTitles(): void {
    this.owner.syncChatSessionTitle(this.id, this.sessionTitle);
  }
}
