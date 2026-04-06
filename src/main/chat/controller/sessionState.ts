import type { ModelMessage } from "ai";
import type {
  AgentToolEvent,
  ChatHistoryEntry,
  ChatLatestRun,
  ChatSessionState,
  ChatSourcePage,
  CompanionEvent,
} from "../../agent/types";
import { extractMessageText } from "../sessionUtils";

export function hasMeaningfulSessionContent(params: {
  messages: ModelMessage[];
  toolEvents: AgentToolEvent[];
  latestRun: ChatLatestRun;
}): boolean {
  return (
    params.messages.length > 0 ||
    params.toolEvents.length > 0 ||
    params.latestRun.status !== "idle"
  );
}

export function createChatHistorySummary(params: {
  sessionId: string;
  sessionTitle: string;
  messages: ModelMessage[];
  updatedAt: number;
}): ChatHistoryEntry {
  const latestUserMessage = [...params.messages]
    .reverse()
    .find((message) => message.role === "user");
  const latestAssistantMessage = [...params.messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const preview =
    (latestUserMessage && extractMessageText(latestUserMessage.content)) ||
    (latestAssistantMessage &&
      extractMessageText(latestAssistantMessage.content)) ||
    null;

  return {
    sessionId: params.sessionId,
    title: params.sessionTitle,
    preview,
    updatedAt: params.updatedAt,
  };
}

export function createChatSessionState(params: {
  sessionId: string;
  sourcePage: ChatSourcePage | null;
  messages: ModelMessage[];
  toolEvents: AgentToolEvent[];
  companionEvents: CompanionEvent[];
  latestRun: ChatLatestRun;
  sessionTitle: string;
  currentWorkTabId: string | null;
  agentTabIds: Iterable<string>;
  history: ChatHistoryEntry[];
  llmProvider: ChatSessionState["llmProvider"];
  llmModel: string;
  lastOpenAIResponseId: string | null;
}): ChatSessionState {
  return {
    sessionId: params.sessionId,
    sourcePage: params.sourcePage ? { ...params.sourcePage } : null,
    messages: [...params.messages],
    toolEvents: [...params.toolEvents],
    companionEvents: [...params.companionEvents],
    latestRun: { ...params.latestRun },
    sessionTitle: params.sessionTitle,
    currentWorkTabId: params.currentWorkTabId,
    agentTabIds: Array.from(params.agentTabIds),
    history: params.history,
    llmProvider: params.llmProvider,
    llmModel: params.llmModel,
    lastOpenAIResponseId: params.lastOpenAIResponseId,
  };
}

export function createConversationHistory(
  messages: ModelMessage[],
  limit = 4,
): Array<{ role: string; content: string }> {
  return messages.slice(-limit).map((message) => ({
    role: message.role,
    content: extractMessageText(message.content),
  }));
}

export function createUserMessage(
  message: string,
  screenshot: string | null,
): ModelMessage {
  if (!screenshot) {
    return {
      role: "user",
      content: message,
    };
  }

  return {
    role: "user",
    content: [
      { type: "image", image: screenshot },
      { type: "text", text: message },
    ],
  };
}
