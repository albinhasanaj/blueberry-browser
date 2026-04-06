import type { AgentToolEvent } from "@common/components/chat/types";

export type CompanionEventType =
  | "companion:message"
  | "companion:thinking"
  | "companion:done"
  | "companion:activity";

export interface CompanionEvent {
  type: CompanionEventType;
  fromId: string;
  fromName: string;
  fromEmoji: string;
  toId?: string;
  toName?: string;
  content: string;
  timestamp: number;
  isFinal?: boolean;
  turnIndex?: number;
  activity?: string;
  tabId?: string;
  tabUrl?: string;
}

export interface SourcePage {
  tabId: string | null;
  url: string;
  title: string;
  text: string | null;
}

export interface LatestRun {
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
  sourcePage: SourcePage | null;
  messages: unknown[];
  toolEvents: AgentToolEvent[];
  companionEvents: CompanionEvent[];
  latestRun: LatestRun;
  sessionTitle: string;
  currentWorkTabId: string | null;
  agentTabIds: string[];
  history: ChatHistoryEntry[];
}

export const EMPTY_RUN: LatestRun = {
  status: "idle",
  taskTitle: null,
  startedAt: null,
  finishedAt: null,
  stepCount: 0,
  completedStepCount: 0,
  errorCount: 0,
};
