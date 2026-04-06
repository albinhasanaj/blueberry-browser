import { tool as defineTool } from "ai";
import { z } from "zod";
import { loadPrompt } from "../prompts/loadPrompt";
import { buildCoreRoster } from "../../companionMarketplace/runtime";
import { getAllCompanions, getOrchestratorCompanion } from "./registry";
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
import type { OrchestrationParams } from "./orchestration/types";
import { executeTaskPlan } from "./orchestration/workers";

function buildPlanningSystemAddition(): string {
  const rosterText = buildCoreRoster(getAllCompanions());
  return [
    loadPrompt("orchestrator/plan"),
    "",
    "Core roster available right now:",
    rosterText,
    "",
    "If the core roster is not a strong fit, call `search_marketplace_companions` with a focused query before finalizing the plan.",
  ].join("\n");
}

export async function runOrchestration(
  params: OrchestrationParams,
): Promise<void> {
  const orchestrator = getOrchestratorCompanion();
  const orchestratorIdentity = toCompanionIdentity(orchestrator);

  console.log("[companion] ---- Phase 1: Planning ----");
  console.log(
    `[companion] Orchestrator: ${orchestrator.name} (${orchestrator.id})`,
  );
  console.log(`[companion] User message: ${params.userMessage}`);

  const planSystemAddition = buildPlanningSystemAddition();
  console.log(`[companion] Plan system addition: ${planSystemAddition}`);

  let planText: string;
  try {
    planText = await streamOrchestratorText({
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
            query: z.string().describe("Natural-language query for the kind of companion needed."),
            limit: z
              .number()
              .int()
              .min(1)
              .max(5)
              .optional()
              .describe("Maximum number of companions to return."),
          }),
          execute: async ({ query, limit }) => {
            const results = await params.marketplaceService.searchPublishedForPlanning(
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
    console.log(`[companion] Plan raw response:\n${planText}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[companion] Plan generation failed: ${message}`);
    emitMessage(
      params,
      orchestratorIdentity,
      `I ran into a problem creating the plan: ${message}`,
    );
    params.onFinalResponse(
      `Sorry, I couldn't process that request: ${message}`,
    );
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
    let finalText: string;

    try {
      finalText = await streamOrchestratorText({
        systemAddition: directPrompt,
        userContent: buildDirectInput(
          params.userMessage,
          params.conversationHistory,
        ),
        orchestratorPrompt: orchestrator.systemPrompt,
        abortSignal: params.abortSignal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finalText = `Sorry, I had trouble responding: ${message}`;
    }

    emitDone(params, orchestrator, "Response complete", true);
    params.onFinalResponse(finalText);
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
    const finalText = selfResult?.rawText ?? "Done!";
    console.log("[companion] ---- Orchestration complete (self-executed) ----");
    params.onFinalResponse(finalText);
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

  let finalText: string;
  try {
    finalText = await streamOrchestratorText({
      systemAddition: synthesisPrompt,
      userContent: synthesisInput,
      orchestratorPrompt: orchestrator.systemPrompt,
      abortSignal: params.abortSignal,
      onTextDelta: (accumulated) => {
        params.onCompanionEvent({
          type: "companion:thinking",
          fromId: orchestrator.id,
          fromName: orchestrator.name,
          fromEmoji: orchestrator.emoji,
          content: accumulated,
          timestamp: Date.now(),
        });
      },
    });
    console.log(
      `[companion] Final synthesis (first 1000 chars):\n${finalText.substring(0, 1000)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[companion] Synthesis failed: ${message}`);
    finalText = `I collected results from the team but had trouble synthesizing them: ${message}`;
  }

  emitDone(params, orchestrator, "Synthesis complete", true);
  console.log("[companion] ---- Orchestration complete ----");
  params.onFinalResponse(finalText);
}
