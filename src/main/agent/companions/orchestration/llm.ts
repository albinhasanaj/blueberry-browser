import { ToolLoopAgent, stepCountIs, type ProviderMetadata } from "ai";
import {
  type LLMRouter,
  type LLMRunScope,
  safeTemperatureForRoute,
} from "../../llmRouter";
import { createStreamAggregator } from "../../streamAggregation";
import type { CompanionRunResult } from "../types";

export type OrchestratorToolSet = Record<string, unknown>;

export interface StreamedOrchestratorText {
  text: string;
  reasoning: string;
  responseId: string | null;
  providerMetadata?: ProviderMetadata;
}

export async function streamOrchestratorText(params: {
  router: LLMRouter;
  scope?: LLMRunScope;
  previousOpenAIResponseId?: string | null;
  systemAddition: string;
  userContent: string;
  orchestratorPrompt: string;
  abortSignal?: AbortSignal;
  onTextDelta?: (accumulated: string) => void;
  onReasoningDelta?: (accumulated: string) => void;
  tools?: OrchestratorToolSet;
}): Promise<StreamedOrchestratorText> {
  const route = params.router.resolve(params.scope ?? "worker", {
    previousOpenAIResponseId: params.previousOpenAIResponseId,
  });
  const hasTools = params.tools && Object.keys(params.tools).length > 0;

  const agent = new ToolLoopAgent({
    model: route.modelInstance,
    instructions: `${params.orchestratorPrompt}\n\n${params.systemAddition}`,
    tools: (params.tools ?? {}) as NonNullable<
      ConstructorParameters<typeof ToolLoopAgent>[0]["tools"]
    >,
    stopWhen: hasTools ? stepCountIs(3) : undefined,
    temperature: safeTemperatureForRoute(route, 0.3),
    providerOptions: route.providerOptions,
  });

  const result = await agent.stream({
    prompt: params.userContent,
    abortSignal: params.abortSignal,
  });

  const aggregate = createStreamAggregator({
    onTextDelta: params.onTextDelta,
    onReasoningDelta: params.onReasoningDelta,
  });

  for await (const part of result.fullStream) {
    aggregate.consume(part);
  }

  const finalized = aggregate.finalize(await result.providerMetadata);

  return {
    text: finalized.text,
    reasoning: finalized.reasoning,
    responseId: finalized.responseId,
    providerMetadata: finalized.providerMetadata,
  };
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

  if (
    params.result.structuredOutput === null ||
    params.result.structuredOutput === undefined
  ) {
    return {
      accepted: false,
      feedback:
        "No structured data was returned. The worker must call submit_result with their findings.",
    };
  }

  const structured = params.result.structuredOutput;
  const leaves = extractLeafValuesForEval(structured);
  const nullCount = leaves.filter((v) => v === null || v === undefined).length;
  const nullRatio = leaves.length > 0 ? nullCount / leaves.length : 0;

  if (effortRatio < 0.1) {
    return {
      accepted: false,
      feedback: `The worker only used ${toolCallCount}/${maxSteps} steps (${Math.round(effortRatio * 100)}%). They need to do substantially more research themselves - visit actual pages, not just delegate or read Google snippets.`,
    };
  }

  if (effortRatio < 0.15 && nullRatio > 0.5) {
    return {
      accepted: false,
      feedback: `The worker only used ${toolCallCount}/${maxSteps} steps (${Math.round(effortRatio * 100)}%) and ${Math.round(nullRatio * 100)}% of data fields are null. They should search more thoroughly for the missing data.`,
    };
  }

  if (nullRatio > 0.8) {
    return {
      accepted: false,
      feedback: `${Math.round(nullRatio * 100)}% of fields are null/empty. The worker should try different sources and search queries.`,
    };
  }

  return { accepted: true, feedback: "" };
}

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
    if (
      lk === "name" ||
      lk === "id" ||
      lk === "label" ||
      lk === "source" ||
      lk === "description"
    ) {
      continue;
    }
    values.push(...extractLeafValuesForEval(val));
  }
  return values;
}
