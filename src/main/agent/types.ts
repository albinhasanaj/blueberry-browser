import type { ModelMessage } from "ai";
import type { CompanionEvent } from "./companions/types";

export type { CompanionEvent };
export type LLMProvider = "openai" | "anthropic";

export interface ChatRequest {
  message: string;
  messageId: string;
}

export interface StreamChunk {
  content: string;
  isComplete: boolean;
}

export interface AgentToolEvent {
  toolName: string;
  input: Record<string, unknown>;
  status: "started" | "completed" | "error";
  result?: string;
  error?: string;
  stepIndex: number;
  callId: string;
  turnIndex?: number;
}

export interface ChatSourcePage {
  tabId: string | null;
  url: string;
  title: string;
  text: string | null;
}

export interface ChatLatestRun {
  status: "idle" | "running" | "completed" | "error";
  taskTitle: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  stepCount: number;
  completedStepCount: number;
  errorCount: number;
}

export interface ChatHistoryEntry {
  sessionId: string;
  title: string;
  preview: string | null;
  updatedAt: number;
}

export interface ChatSessionState {
  sessionId: string;
  sourcePage: ChatSourcePage | null;
  messages: ModelMessage[];
  toolEvents: AgentToolEvent[];
  companionEvents: CompanionEvent[];
  latestRun: ChatLatestRun;
  sessionTitle: string;
  currentWorkTabId: string | null;
  agentTabIds: string[];
  history: ChatHistoryEntry[];
  llmProvider: LLMProvider;
  llmModel: string;
  lastOpenAIResponseId: string | null;
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-20250514",
};

export const MAX_CONTEXT_LENGTH = 4000;
export const DEFAULT_TEMPERATURE = 0.7;
export const MAX_AGENT_STEPS = 250;
export const SCREENSHOT_JPEG_QUALITY = 75;
