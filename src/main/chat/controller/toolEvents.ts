import type { ToolCallRef } from "../../agent/browserToolRuntime";
import type { AgentToolEvent, ChatLatestRun } from "../../agent/types";

export function createToolCallRef(
  stepIndex: number,
  ref?: ToolCallRef,
): ToolCallRef {
  if (ref) return ref;

  return {
    stepIndex,
    callId: `${stepIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function createAgentToolEvent(params: {
  toolName: string;
  input: Record<string, unknown>;
  status: AgentToolEvent["status"];
  turnIndex: number;
  ref: ToolCallRef;
  result?: string;
  error?: string;
}): AgentToolEvent {
  return {
    toolName: params.toolName,
    input: params.input,
    status: params.status,
    result: params.result,
    error: params.error,
    stepIndex: params.ref.stepIndex,
    callId: params.ref.callId,
    turnIndex: params.turnIndex,
  };
}

export function upsertToolEvent(
  toolEvents: AgentToolEvent[],
  event: AgentToolEvent,
): void {
  const existingIndex = toolEvents.findIndex(
    (item) => item.callId === event.callId,
  );

  if (existingIndex >= 0) {
    toolEvents[existingIndex] = event;
    return;
  }

  toolEvents.push(event);
}

export function applyToolRunProgress(params: {
  latestRun: ChatLatestRun;
  toolEvents: AgentToolEvent[];
  turnIndex: number;
}): ChatLatestRun {
  const turnEvents = params.toolEvents.filter(
    (event) => event.turnIndex === params.turnIndex,
  );

  return {
    ...params.latestRun,
    stepCount: turnEvents.length,
    completedStepCount: turnEvents.filter(
      (event) => event.status === "completed",
    ).length,
    errorCount: turnEvents.filter((event) => event.status === "error").length,
  };
}
