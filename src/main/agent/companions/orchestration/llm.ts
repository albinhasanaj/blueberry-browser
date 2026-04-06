import { streamText } from "ai";
import { createModel, getModelName, getProvider } from "../../modelProvider";
import type { CompanionRunResult } from "../types";

export type OrchestratorToolSet = NonNullable<
  Parameters<typeof streamText>[0]["tools"]
>;

export async function streamOrchestratorText(params: {
  systemAddition: string;
  userContent: string;
  orchestratorPrompt: string;
  abortSignal?: AbortSignal;
  onTextDelta?: (accumulated: string) => void;
  tools?: OrchestratorToolSet;
}): Promise<string> {
  const provider = getProvider();
  const modelName = getModelName(provider);
  const model = createModel(provider, modelName);

  if (!model) {
    throw new Error("LLM model not configured");
  }

  const result = streamText({
    model,
    system: `${params.orchestratorPrompt}\n\n${params.systemAddition}`,
    messages: [{ role: "user" as const, content: params.userContent }],
    tools: params.tools ?? {},
    temperature: 0.3,
    maxRetries: 2,
    abortSignal: params.abortSignal,
  });

  let text = "";

  for await (const part of result.fullStream) {
    if (part.type !== "text-delta") continue;

    text += part.text;
    params.onTextDelta?.(text);
  }

  return text;
}

export function workerNeedsClarification(rawText: string): string | null {
  const jsonFenceIndex = rawText.indexOf("```json");
  const firstBraceIndex = rawText.indexOf("{");
  const jsonStartIndex =
    jsonFenceIndex >= 0
      ? jsonFenceIndex
      : firstBraceIndex >= 0
        ? firstBraceIndex
        : rawText.length;

  const proseSection = rawText.substring(0, jsonStartIndex);
  return proseSection.includes("?") ? proseSection.trim() : null;
}

export async function evaluateWorkerResult(params: {
  task: string;
  result: CompanionRunResult;
}): Promise<{ accepted: boolean; feedback: string }> {
  const toolCallCount = params.result.toolCallCount ?? 0;
  const maxSteps = params.result.maxSteps ?? 100;
  const effortRatio = maxSteps > 0 ? toolCallCount / maxSteps : 1;

  // No structured output at all — always reject
  if (params.result.structuredOutput === null || params.result.structuredOutput === undefined) {
    return { accepted: false, feedback: "No structured data was returned. The worker must call submit_result with their findings." };
  }

  // Check semantic quality (null ratio)
  const structured = params.result.structuredOutput;
  const leaves = extractLeafValuesForEval(structured);
  const nullCount = leaves.filter(v => v === null || v === undefined).length;
  const nullRatio = leaves.length > 0 ? nullCount / leaves.length : 0;

  // Ultra-low effort — likely delegated everything or barely tried
  if (effortRatio < 0.1) {
    return {
      accepted: false,
      feedback: `The worker only used ${toolCallCount}/${maxSteps} steps (${Math.round(effortRatio * 100)}%). They need to do substantially more research themselves — visit actual pages, not just delegate or read Google snippets.`,
    };
  }

  // Very low effort + high null ratio = gave up too early
  if (effortRatio < 0.15 && nullRatio > 0.5) {
    return {
      accepted: false,
      feedback: `The worker only used ${toolCallCount}/${maxSteps} steps (${Math.round(effortRatio * 100)}%) and ${Math.round(nullRatio * 100)}% of data fields are null. They should search more thoroughly for the missing data.`,
    };
  }

  // Mostly null data but decent effort — still reject but with different message
  if (nullRatio > 0.8) {
    return {
      accepted: false,
      feedback: `${Math.round(nullRatio * 100)}% of fields are null/empty. The worker should try different sources and search queries.`,
    };
  }

  // Accept anything with reasonable data
  return { accepted: true, feedback: "" };
}

/** Extract leaf values from nested structure for null-ratio checking */
function extractLeafValuesForEval(obj: unknown): unknown[] {
  if (obj === null || obj === undefined) return [obj];
  if (typeof obj !== "object") return [obj];
  if (Array.isArray(obj)) {
    const values: unknown[] = [];
    for (const item of obj) {
      values.push(...extractLeafValuesForEval(item));
    }
    return values;
  }
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const lk = key.toLowerCase();
    // Skip metadata keys that are always populated
    if (lk === "name" || lk === "id" || lk === "label" || lk === "source" || lk === "description") continue;
    values.push(...extractLeafValuesForEval(val));
  }
  return values;
}
