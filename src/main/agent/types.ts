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
}

export type LLMProvider = "openai" | "anthropic";

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
};

export const MAX_CONTEXT_LENGTH = 4000;
export const DEFAULT_TEMPERATURE = 0.7;
export const MAX_AGENT_STEPS = 250;
export const SCREENSHOT_JPEG_QUALITY = 75;
