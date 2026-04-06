export type CompanionRole = "orchestrator" | "worker";

export type CompanionCapability =
  | "lead_generation"
  | "competitor_analysis"
  | "data_extraction"
  | "outreach"
  | "synthesis"
  | "companion_building";

export interface CompanionDeclaration {
  id: string;
  name: string;
  emoji: string;
  role: CompanionRole;
  source?: "core" | "community";
  description?: string;
  bestFor?: string;
  tags?: string[];
  capabilities: CompanionCapability[];
  toolset: string[];
  systemPrompt: string;
  maxSteps: number;
  temperature: number;
}

export interface CompanionMessage {
  id: string;
  fromId: string;
  toId: string;
  content: string;
  timestamp: number;
  type: "request" | "response" | "clarification" | "final";
}

export interface CompanionEvent {
  type: "companion:message" | "companion:thinking" | "companion:done" | "companion:activity";
  fromId: string;
  fromName: string;
  fromEmoji: string;
  toId?: string;
  toName?: string;
  content: string;
  timestamp: number;
  isFinal?: boolean;
  turnIndex?: number;
  /** Activity label shown during streaming, e.g. "browsing linkedin.com", "analyzing data" */
  activity?: string;
  /** Tab ID this activity is targeting (for parallel tab visualization) */
  tabId?: string;
  /** Short hostname of the tab URL */
  tabUrl?: string;
}

export interface CompanionRunResult {
  companionId: string;
  companionName?: string;
  companionKind?: "core" | "marketplace";
  structuredOutput: unknown;
  rawText: string;
  messages: CompanionMessage[];
  success: boolean;
  error?: string;
  toolCallCount?: number;
  maxSteps?: number;
  responseId?: string | null;
}
