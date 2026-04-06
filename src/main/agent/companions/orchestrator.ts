import { tool as defineTool } from "ai";
import { z } from "zod";
import { loadPrompt } from "../prompts/loadPrompt";
import { buildCoreRoster } from "../../companionMarketplace/runtime";
import {
  getAllCompanions,
  getCompanion,
  getOrchestratorCompanion,
} from "./registry";
import {
  emitActivity,
  emitDone,
  emitMessage,
  toCompanionIdentity,
} from "./orchestration/events";
import {
  buildDirectInput,
  buildPlanningInput,
  buildSynthesisInput,
  hasDelegatedTasks,
  isOnlyOrchestratorTask,
  parseTaskPlan,
} from "./orchestration/inputs";
import { streamOrchestratorText } from "./orchestration/llm";
import type {
  FinalResponsePayload,
  OrchestrationParams,
} from "./orchestration/types";
import { executeTaskPlan } from "./orchestration/workers";
import { runWorker } from "./runner";
import type { CompanionRunResult } from "./types";

function buildPlanningSystemAddition(): string {
  const rosterText = buildCoreRoster(getAllCompanions());
  return [
    loadPrompt("orchestrator/plan"),
    "",
    "Core roster available right now:",
    rosterText,
    "",
    "If the task involves a specific domain or niche, ALWAYS call `search_marketplace_companions` first to check for a specialist before falling back to core companions.",
  ].join("\n");
}

function emitReasoning(
  params: OrchestrationParams,
  companion: ReturnType<typeof getOrchestratorCompanion>,
  content: string,
): void {
  if (!content.trim()) return;
  params.onCompanionEvent({
    type: "companion:thinking",
    fromId: companion.id,
    fromName: companion.name,
    fromEmoji: companion.emoji,
    content,
    timestamp: Date.now(),
  });
}

const BUILD_COMPANION_PREFIX = "[BUILD_COMPANION] ";

export async function runOrchestration(
  params: OrchestrationParams,
): Promise<void> {
  if (params.userMessage.startsWith(BUILD_COMPANION_PREFIX)) {
    return runCompanionBuilderFlow(params);
  }

  const orchestrator = getOrchestratorCompanion();
  const orchestratorIdentity = toCompanionIdentity(orchestrator);

  console.log("[companion] ---- Phase 1: Planning ----");
  console.log(
    `[companion] Orchestrator: ${orchestrator.name} (${orchestrator.id})`,
  );
  console.log(`[companion] User message: ${params.userMessage}`);
  console.log(
    `[companion] Route: ${params.llmProvider}/${params.llmModel} (previous_response_id=${params.previousOpenAIResponseId ?? "none"})`,
  );

  const planSystemAddition = buildPlanningSystemAddition();
  console.log(`[companion] Plan system addition: ${planSystemAddition}`);

  let planText: string;
  try {
    const planResult = await streamOrchestratorText({
      router: params.router,
      scope: "worker",
      systemAddition: planSystemAddition,
      userContent: buildPlanningInput(
        params.userMessage,
        params.conversationHistory,
      ),
      orchestratorPrompt: orchestrator.systemPrompt,
      abortSignal: params.abortSignal,
      tools: {
        search_marketplace_companions: defineTool({
          description:
            "Search published community companions when the core roster does not appear to fit the task well.",
          inputSchema: z.object({
            query: z
              .string()
              .describe(
                "Natural-language query for the kind of companion needed.",
              ),
            limit: z
              .number()
              .int()
              .min(1)
              .max(5)
              .optional()
              .describe("Maximum number of companions to return."),
          }),
          execute: async ({ query, limit }) => {
            const results =
              await params.marketplaceService.searchPublishedForPlanning(
                query,
                limit ?? 4,
              );

            return {
              results: results.map((result) => ({
                id: result.companion.id,
                name: result.companion.name,
                description: result.companion.description,
                bestFor: result.companion.bestFor,
                tags: result.companion.tags,
                score: Number(result.score.toFixed(3)),
                matchReason: result.matchReason,
              })),
            };
          },
        }),
      },
    });
    planText = planResult.text;
    console.log(`[companion] Plan raw response:\n${planText}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[companion] Plan generation failed: ${message}`);
    emitMessage(
      params,
      orchestratorIdentity,
      `I ran into a problem creating the plan: ${message}`,
    );
    params.onFinalResponse({
      text: `Sorry, I couldn't process that request: ${message}`,
    });
    return;
  }

  const plan = parseTaskPlan(planText, params.userMessage);
  console.log(`[companion] Parsed plan: ${plan.tasks.length} task(s)`);
  for (const task of plan.tasks) {
    console.log(
      `[companion]   > ${task.companionKind ?? "core"}:${task.companionId}: ${task.task} (${task.reason})`,
    );
  }

  if (plan.tasks.length === 0) {
    console.log("[companion] Empty plan - Blueberry answering directly");

    const directPrompt = loadPrompt("orchestrator/direct");
    let finalPayload: FinalResponsePayload;

    try {
      const directResult = await streamOrchestratorText({
        router: params.router,
        scope: "chat",
        previousOpenAIResponseId: params.previousOpenAIResponseId,
        systemAddition: directPrompt,
        userContent: buildDirectInput(
          params.userMessage,
          params.conversationHistory,
        ),
        orchestratorPrompt: orchestrator.systemPrompt,
        abortSignal: params.abortSignal,
        onReasoningDelta: (accumulated) => {
          emitReasoning(params, orchestrator, accumulated);
        },
      });

      finalPayload = {
        text: directResult.text,
        responseId: directResult.responseId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finalPayload = {
        text: `Sorry, I had trouble responding: ${message}`,
        responseId: null,
      };
    }

    emitDone(params, orchestrator, "Response complete", true);
    params.onFinalResponse(finalPayload);
    return;
  }

  if (hasDelegatedTasks(plan, orchestrator.id)) {
    emitMessage(
      params,
      orchestratorIdentity,
      "Let me break this down and get the right people on it.",
    );
  }

  const results = await executeTaskPlan({
    orchestration: params,
    plan,
    orchestrator,
  });

  if (isOnlyOrchestratorTask(plan, orchestrator.id)) {
    console.log("[companion] Blueberry self-executed - skipping synthesis");
    const selfResult = results.get(`core:${orchestrator.id}`);
    const finalPayload: FinalResponsePayload = {
      text: selfResult?.rawText ?? "Done!",
      responseId: selfResult?.responseId ?? null,
    };
    console.log("[companion] ---- Orchestration complete (self-executed) ----");
    params.onFinalResponse(finalPayload);
    return;
  }

  console.log("[companion] ---- Phase 3: Synthesis ----");
  console.log(`[companion] Workers completed: ${results.size}`);
  for (const [companionId, result] of results) {
    console.log(
      `[companion]   ${companionId}: success=${result.success}, output=${result.structuredOutput ? "yes" : "no"}`,
    );
  }

  emitActivity(params, orchestrator, "analyzing results...");

  const synthesisPrompt = loadPrompt("orchestrator/synthesis");
  const synthesisInput = buildSynthesisInput(params.userMessage, results);
  console.log(`[companion] Synthesis prompt: ${synthesisPrompt}`);
  console.log(
    `[companion] Synthesis input (first 2000 chars):\n${synthesisInput.substring(0, 2000)}`,
  );

  let finalPayload: FinalResponsePayload;
  try {
    const synthesisResult = await streamOrchestratorText({
      router: params.router,
      scope: "chat",
      previousOpenAIResponseId: params.previousOpenAIResponseId,
      systemAddition: synthesisPrompt,
      userContent: synthesisInput,
      orchestratorPrompt: orchestrator.systemPrompt,
      abortSignal: params.abortSignal,
      onReasoningDelta: (accumulated) => {
        emitReasoning(params, orchestrator, accumulated);
      },
    });
    finalPayload = {
      text: synthesisResult.text,
      responseId: synthesisResult.responseId,
    };
    console.log(
      `[companion] Final synthesis (first 1000 chars):\n${finalPayload.text.substring(0, 1000)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[companion] Synthesis failed: ${message}`);
    finalPayload = {
      text: `I collected results from the team but had trouble synthesizing them: ${message}`,
      responseId: null,
    };
  }

  emitDone(params, orchestrator, "Synthesis complete", true);
  console.log("[companion] ---- Orchestration complete ----");
  params.onFinalResponse(finalPayload);
}

async function runCompanionBuilderFlow(
  params: OrchestrationParams,
): Promise<void> {
  const description = params.userMessage.slice(BUILD_COMPANION_PREFIX.length);
  const orchestrator = getOrchestratorCompanion();
  const orchestratorIdentity = toCompanionIdentity(orchestrator);
  const archer = getCompanion("archer");
  const archerIdentity = toCompanionIdentity(archer);

  console.log("[companion] ---- Companion Builder Flow ----");
  console.log(`[companion] Description: ${description}`);

  emitMessage(
    params,
    orchestratorIdentity,
    `Building a companion for: "${description}". Let me research this.`,
  );

  emitMessage(
    params,
    orchestratorIdentity,
    `Archer, research best practices and build a companion specification for: ${description}`,
    archerIdentity,
  );

  let result: CompanionRunResult;
  try {
    result = await runWorker({
      companion: archer,
      task: `Research best practices, strategies, and expert techniques for: "${description}". Then design a complete companion specification based on your findings.`,
      context: {},
      deps: params.deps,
      router: params.router,
      onEvent: params.onCompanionEvent,
      abortSignal: params.abortSignal,
      availableWorkers: getAllCompanions().filter((c) => c.role === "worker"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[companion] Archer failed: ${message}`);
    params.onFinalResponse({
      text: `Sorry, I had trouble researching that companion: ${message}`,
    });
    return;
  }

  emitDone(params, archer, "Research complete");

  console.log("[companion] ---- Companion Builder Synthesis ----");
  emitActivity(params, orchestrator, "assembling companion spec...");

  const synthesisPrompt = loadPrompt("orchestrator/synthesis");
  const workerOutput = result.structuredOutput
    ? JSON.stringify(result.structuredOutput, null, 2)
    : result.rawText;

  let finalPayload: FinalResponsePayload;
  try {
    const synthesisResult = await streamOrchestratorText({
      router: params.router,
      scope: "chat",
      previousOpenAIResponseId: params.previousOpenAIResponseId,
      systemAddition: synthesisPrompt,
      userContent: [
        `Original request: Build a companion for "${description}"`,
        "",
        "Worker results (from Archer, the companion architect):",
        workerOutput,
      ].join("\n"),
      orchestratorPrompt: orchestrator.systemPrompt,
      abortSignal: params.abortSignal,
      onReasoningDelta: (accumulated) => {
        emitReasoning(params, orchestrator, accumulated);
      },
    });
    finalPayload = {
      text: synthesisResult.text,
      responseId: synthesisResult.responseId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finalPayload = {
      text: `I researched the domain but had trouble assembling the companion: ${message}`,
      responseId: null,
    };
  }

  emitDone(params, orchestrator, "Companion spec ready", true);
  console.log("[companion] ---- Companion Builder Flow complete ----");
  params.onFinalResponse(finalPayload);
}
