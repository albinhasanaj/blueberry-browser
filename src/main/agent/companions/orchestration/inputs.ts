import { extractJSON } from "../runner";
import type { CompanionRunResult } from "../types";
import type { TaskPlan } from "./types";

function buildConversationHistoryBlock(
  conversationHistory?: Array<{ role: string; content: string }>,
): string | null {
  if (!conversationHistory || conversationHistory.length === 0) {
    return null;
  }

  return conversationHistory
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

export function buildPlanningInput(
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): string {
  const historyBlock = buildConversationHistoryBlock(conversationHistory);

  if (!historyBlock) {
    return userMessage;
  }

  return `Previous conversation:\n${historyBlock}\n\nCurrent request: ${userMessage}`;
}

export function buildDirectInput(
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): string {
  const historyBlock = buildConversationHistoryBlock(conversationHistory);

  if (!historyBlock) {
    return `User message: ${userMessage}`;
  }

  return `Previous conversation:\n${historyBlock}\n\nCurrent message: ${userMessage}`;
}

export function buildClarificationInput(
  userMessage: string,
  clarificationQuestion: string,
): string {
  return `Original user request: ${userMessage}\n\nWorker question: ${clarificationQuestion}`;
}

export function parseTaskPlan(planText: string, userMessage: string): TaskPlan {
  const parsedPlan = extractJSON(planText) as
    | { tasks?: Array<Record<string, unknown>> }
    | null;

  if (parsedPlan && Array.isArray(parsedPlan.tasks)) {
    return {
      tasks: parsedPlan.tasks
        .filter(
          (task) =>
            typeof task.companionId === "string" &&
            typeof task.task === "string" &&
            typeof task.reason === "string",
        )
        .map((task) => ({
          companionKind:
            task.companionKind === "marketplace" ? "marketplace" : "core",
          companionId: String(task.companionId),
          task: String(task.task),
          reason: String(task.reason),
        })),
    };
  }

  return {
    tasks: [
      {
        companionKind: "core",
        companionId: "ella",
        task: userMessage,
        reason: "Fallback -- could not parse a structured plan",
      },
    ],
  };
}

export function hasDelegatedTasks(
  plan: TaskPlan,
  orchestratorId: string,
): boolean {
  return plan.tasks.some((task) => task.companionId !== orchestratorId);
}

export function isOnlyOrchestratorTask(
  plan: TaskPlan,
  orchestratorId: string,
): boolean {
  return (
    plan.tasks.length === 1 && plan.tasks[0].companionId === orchestratorId
  );
}

export function summarizeWorkerResults(
  results: Map<string, CompanionRunResult>,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};

  for (const [companionId, result] of results) {
    summary[companionId] = {
      companionId: result.companionId,
      companionName: result.companionName,
      companionKind: result.companionKind ?? "core",
      success: result.success,
      data: result.structuredOutput,
      rawSummary: result.rawText.substring(0, 2000),
      error: result.error,
    };
  }

  return summary;
}

export function buildSynthesisInput(
  userMessage: string,
  results: Map<string, CompanionRunResult>,
): string {
  const summary = summarizeWorkerResults(results);
  return `Original request: ${userMessage}\n\nTeam results:\n${JSON.stringify(summary, null, 2)}`;
}
