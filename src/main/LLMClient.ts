import { WebContents } from "electron";
import {
  streamText,
  stepCountIs,
  type LanguageModel,
  type CoreMessage,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type { Window } from "./Window";
import type { Tab } from "./Tab";
import {
  type ChatRequest,
  type StreamChunk,
  type AgentToolEvent,
  type LLMProvider,
  DEFAULT_TEMPERATURE,
  MAX_AGENT_STEPS,
  SCREENSHOT_JPEG_QUALITY,
} from "./agent/types";
import {
  getProvider,
  getModelName,
  createModel,
  logInitializationStatus,
} from "./agent/modelProvider";
import { createBrowserTools } from "./agent/browserTools";
import { buildSystemPrompt } from "./agent/systemPrompt";
import { recordSuccess } from "./agent/memory";
import { learnFromToolCall, recordFailure as blueprintRecordFailure, formatBlueprintHints } from "./agent/blueprintCache";
import { startTraceRun, trace, endTraceRun } from "./agent/traceLogger";

export class LLMClient {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;
  private messages: CoreMessage[] = [];
  private abortController: AbortController | null = null;
  private toolStepIndex = 0;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.provider = getProvider();
    this.modelName = getModelName(this.provider);
    this.model = createModel(this.provider, this.modelName);
    logInitializationStatus(this.provider, this.modelName, this.model);
  }

  setWindow(window: Window): void {
    this.window = window;
  }

  stopAgent(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Main chat + agent entry point
  // ---------------------------------------------------------------------------

  async sendChatMessage(request: ChatRequest): Promise<void> {
    this.abortController = new AbortController();
    this.toolStepIndex = 0;

    startTraceRun(request.message);
    trace("run", "start", { prompt: request.message, messageId: request.messageId });

    try {
      const screenshot = await this.captureScreenshot();

      const userContent: Array<
        { type: "image"; image: string } | { type: "text"; text: string }
      > = [];
      if (screenshot) {
        userContent.push({ type: "image", image: screenshot });
      }
      userContent.push({ type: "text", text: request.message });

      const userMessage: CoreMessage = {
        role: "user",
        content: userContent.length === 1 ? request.message : userContent,
      };
      this.messages.push(userMessage);
      this.sendMessagesToRenderer();

      if (!this.model) {
        this.sendErrorMessage(
          request.messageId,
          "LLM service is not configured. Please add your API key to the .env file.",
        );
        return;
      }

      const messages = await this.prepareMessagesWithContext();
      await this.streamResponse(messages, request.messageId);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Agent run aborted by user.");
        return;
      }
      console.error("Error in LLM request:", error);
      this.handleStreamError(error, request.messageId);
    } finally {
      trace("run", "finished", { toolSteps: this.toolStepIndex });
      endTraceRun({ totalToolSteps: this.toolStepIndex });
      this.abortController = null;
    }
  }

  clearMessages(): void {
    this.stopAgent();
    this.messages = [];
    this.sendMessagesToRenderer();
  }

  getMessages(): CoreMessage[] {
    return this.messages;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private getActiveTabOrThrow(): Tab {
    const tab = this.window?.activeTab;
    if (!tab) throw new Error("No active tab available");
    return tab;
  }

  private getCurrentDomain(): string | null {
    try {
      const tab = this.window?.activeTab;
      const liveUrl = tab?.webContents?.getURL();
      const cachedUrl = tab?.url;
      const url = liveUrl || cachedUrl;
      const domain = url ? new URL(url).hostname : null;
      trace("domain", "resolve", { liveUrl: liveUrl ?? null, cachedUrl: cachedUrl ?? null, resolved: domain });
      return domain;
    } catch {
      return null;
    }
  }

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
    const callId = ref?.callId ?? `${stepIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const event: AgentToolEvent = {
      toolName,
      input,
      status,
      result,
      error,
      stepIndex,
      callId,
    };
    this.webContents.send("agent-tool-call", event);
    return { stepIndex, callId };
  }

  /**
   * Record a successful tool interaction to the memory store.
   * Records click/type/find interactions that succeed on a domain.
   */
  private recordToolMemory(
    toolName: string,
    input: unknown,
    output: unknown,
  ): void {
    if (!["click", "type", "find"].includes(toolName)) return;

    const inp = input as Record<string, unknown>;
    // For ref-based tools, record the ref; for selector-based, record the selector
    const identifier =
      (inp.selector as string | undefined) ||
      (inp.css as string | undefined) ||
      (inp.ref != null ? `ref=${inp.ref}` : undefined);
    if (!identifier) return;

    const out = typeof output === "string" ? output : "";
    if (out.startsWith("Error")) return;

    const domain = this.getCurrentDomain();
    if (!domain) return;

    try {
      recordSuccess(domain, identifier, toolName, out.substring(0, 120));
    } catch (err) {
      console.error("Failed to record tool memory:", err);
    }
  }

  private async captureScreenshot(): Promise<string | null> {
    const activeTab = this.window?.activeTab;
    if (!activeTab) return null;
    try {
      const image = await activeTab.screenshot();
      const jpegBuffer = image.toJPEG(SCREENSHOT_JPEG_QUALITY);
      return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
    } catch (error) {
      console.error("Failed to capture screenshot:", error);
      return null;
    }
  }

  private stripOldScreenshots(messages: CoreMessage[]): CoreMessage[] {
    return messages.map((msg): CoreMessage => {
      if (msg.role !== "user" || typeof msg.content === "string") return msg;
      if (!Array.isArray(msg.content)) return msg;

      const filtered = msg.content.filter((part) => part.type !== "image");
      if (
        filtered.length === 1 &&
        filtered[0]?.type === "text" &&
        "text" in filtered[0] &&
        typeof filtered[0].text === "string"
      ) {
        return { role: "user", content: filtered[0].text };
      }
      if (filtered.length === 0) {
        return { role: "user", content: "" };
      }
      return { role: "user", content: filtered };
    });
  }

  private sendMessagesToRenderer(): void {
    this.webContents.send("chat-messages-updated", this.messages);
  }

  private async prepareMessagesWithContext(): Promise<CoreMessage[]> {
    let pageUrl: string | null = null;
    let pageText: string | null = null;

    const activeTab = this.window?.activeTab;
    if (activeTab) {
      // Use live URL from webContents (agent tab) over cached _url property
      pageUrl = activeTab.webContents.getURL() || activeTab.url;
      try {
        pageText = await activeTab.getTabText();
      } catch (error) {
        console.error("Failed to get page text:", error);
      }
    }

    const domain = pageUrl ? (() => { try { return new URL(pageUrl!).hostname; } catch { return null; } })() : null;
    console.log("[blueprint] domain:", domain ?? "none", "| source: active tab");
    trace("system_prompt", "build", { domain, pageUrl, hasPageText: !!pageText, pageTextLength: pageText?.length ?? 0 });

    const systemMessage: CoreMessage = {
      role: "system",
      content: buildSystemPrompt(pageUrl, pageText),
    };
    const cleanedMessages = this.stripOldScreenshots(this.messages);
    return [systemMessage, ...cleanedMessages];
  }

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  private async streamResponse(
    messages: CoreMessage[],
    messageId: string,
  ): Promise<void> {
    if (!this.model) throw new Error("Model not initialized");

    const tools = createBrowserTools({
      getActiveTab: () => this.getActiveTabOrThrow(),
      captureScreenshot: () => this.captureScreenshot(),
      emitToolEvent: (...args) => this.emitToolEvent(...args),
      openTab: (url?: string) => {
        if (!this.window) throw new Error("No window available");
        const tab = this.window.createTab(url);
        this.window.switchActiveTab(tab.id);
        return tab;
      },
    });

    let stepCount = 0;
    const result = streamText({
      model: this.model,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      temperature: DEFAULT_TEMPERATURE,
      maxRetries: 3,
      abortSignal: this.abortController?.signal,
      onStepFinish: ({ toolCalls }) => {
        stepCount++;
        if (toolCalls && toolCalls.length > 0) {
          console.log(
            `[Agent] Step ${stepCount}/${MAX_AGENT_STEPS} finished with ${toolCalls.length} tool call(s)`,
          );
        }
        if (stepCount >= MAX_AGENT_STEPS) {
          console.log(`[Agent] Reached max step limit (${MAX_AGENT_STEPS})`);
        }
      },
    });

    await this.processFullStream(result, messageId);
  }

  private async processFullStream<T extends ToolSet>(
    result: StreamTextResult<T, unknown>,
    messageId: string,
  ): Promise<void> {
    let accumulatedText = "";
    const messageIndex = this.messages.length;
    this.messages.push({ role: "assistant", content: "" });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          accumulatedText += part.text;
          this.messages[messageIndex] = {
            role: "assistant",
            content: accumulatedText,
          };
          this.sendMessagesToRenderer();
          this.sendStreamChunk(messageId, {
            content: part.text,
            isComplete: false,
          });
          break;
        }
        case "tool-call": {
          console.log(
            `[Agent] Tool call: ${part.toolName}`,
            JSON.stringify(part.input),
          );
          trace("tool", "call", { toolName: part.toolName, input: part.input as Record<string, unknown> });
          break;
        }
        case "tool-result": {
          console.log(
            `[Agent] Tool result for ${part.toolName}:`,
            typeof part.output === "string"
              ? part.output.substring(0, 100)
              : part.output,
          );
          // Record successful selector-based interactions to memory
          this.recordToolMemory(part.toolName, part.input, part.output);

          trace("tool", "result", {
            toolName: part.toolName,
            input: part.input as Record<string, unknown>,
            output: typeof part.output === "string" ? part.output.substring(0, 300) : part.output,
          });

          // Blueprint learning
          const toolOutput = typeof part.output === "string" ? part.output : "";
          const toolInput = part.input as Record<string, unknown>;
          const bpSelector =
            (toolInput.selector as string | undefined) ||
            (toolInput.css as string | undefined);
          const bpDomain = this.getCurrentDomain();
          const isSuccess =
            !toolOutput.startsWith("Error") &&
            !toolOutput.startsWith("Failed") &&
            !toolOutput.includes("No elements found") &&
            !toolOutput.includes("is not a typeable field") &&
            !toolOutput.includes("is not clickable") &&
            !toolOutput.includes("not found or removed from page");
          if (bpDomain && bpSelector) {
            if (isSuccess) {
              trace("blueprint", "learn", { domain: bpDomain, selector: bpSelector, toolName: part.toolName });
              learnFromToolCall(bpDomain, bpSelector, part.toolName, toolOutput);
            } else {
              trace("blueprint", "failure_recorded", { domain: bpDomain, selector: bpSelector, toolName: part.toolName, reason: toolOutput.substring(0, 150) });
              blueprintRecordFailure(bpDomain, bpSelector);
            }
          }

          // Mid-task blueprint hint injection after navigation
          if (
            (part.toolName === "navigate" || part.toolName === "open_tab") &&
            !toolOutput.startsWith("Error")
          ) {
            const navDomain = this.getCurrentDomain();
            if (navDomain) {
              const hints = formatBlueprintHints(navDomain);
              if (hints) {
                console.log("[blueprint] mid-task inject for", navDomain);
                trace("blueprint", "mid_task_inject", { domain: navDomain, hintsLength: hints.length });
                this.messages.push({ role: "system", content: hints });
              } else {
                trace("blueprint", "mid_task_no_hints", { domain: navDomain });
              }
            }
          }
          break;
        }
        case "error": {
          console.error("[Agent] Stream error:", part);
          break;
        }
      }
    }

    this.messages[messageIndex] = {
      role: "assistant",
      content: accumulatedText,
    };
    this.sendMessagesToRenderer();
    this.sendStreamChunk(messageId, {
      content: accumulatedText,
      isComplete: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Error handling + IPC helpers
  // ---------------------------------------------------------------------------

  private handleStreamError(error: unknown, messageId: string): void {
    console.error("Error streaming from LLM:", error);
    this.sendErrorMessage(messageId, getErrorMessage(error));
  }

  private sendErrorMessage(messageId: string, errorMessage: string): void {
    this.sendStreamChunk(messageId, {
      content: errorMessage,
      isComplete: true,
    });
  }

  private sendStreamChunk(messageId: string, chunk: StreamChunk): void {
    this.webContents.send("chat-response", {
      messageId,
      content: chunk.content,
      isComplete: chunk.isComplete,
    });
  }
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred. Please try again.";
  }
  const message = error.message.toLowerCase();
  if (message.includes("401") || message.includes("unauthorized")) {
    return "Authentication error: Please check your API key in the .env file.";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "Rate limit exceeded. Please try again in a few moments.";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econnrefused")
  ) {
    return "Network error: Please check your internet connection.";
  }
  if (message.includes("timeout")) {
    return "Request timeout: The service took too long to respond. Please try again.";
  }
  return "Sorry, I encountered an error while processing your request. Please try again.";
}
