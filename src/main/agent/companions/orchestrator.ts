import { streamText } from "ai";
import type { BrowserToolDeps } from "../browserTools";
import { createModel, getModelName, getProvider } from "../modelProvider";
import { getCompanion, getOrchestratorCompanion } from "./registry";
import { runWorker, extractJSON } from "./runner";
import { loadPrompt } from "../prompts/loadPrompt";
import type { CompanionEvent, CompanionRunResult } from "./types";

interface OrchestrationParams {
  userMessage: string;
  deps: BrowserToolDeps;
  onCompanionEvent: (event: CompanionEvent) => void;
  onFinalResponse: (text: string) => void;
  abortSignal?: AbortSignal;
  conversationHistory?: Array<{ role: string; content: string }>;
}

interface TaskPlan {
  tasks: Array<{
    companionId: string;
    task: string;
    reason: string;
  }>;
}

function emitMessage(
  params: OrchestrationParams,
  from: { id: string; name: string; emoji: string },
  content: string,
  to?: { id: string; name: string },
  isFinal?: boolean,
): void {
  params.onCompanionEvent({
    type: "companion:message",
    fromId: from.id,
    fromName: from.name,
    fromEmoji: from.emoji,
    toId: to?.id,
    toName: to?.name,
    content,
    timestamp: Date.now(),
    isFinal,
  });
}

async function orchestratorStreamText(
  systemAddition: string,
  userContent: string,
  orchestratorPrompt: string,
  abortSignal?: AbortSignal,
  onTextDelta?: (accumulated: string) => void,
): Promise<string> {
  const provider = getProvider();
  const modelName = getModelName(provider);
  const model = createModel(provider, modelName);

  if (!model) {
    throw new Error("LLM model not configured");
  }

  const result = streamText({
    model,
    system: orchestratorPrompt + "\n\n" + systemAddition,
    messages: [{ role: "user" as const, content: userContent }],
    tools: {},
    temperature: 0.3,
    maxRetries: 2,
    abortSignal,
  });

  let text = "";
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      text += part.text;
      onTextDelta?.(text);
    }
  }
  return text;
}

/**
 * Check if worker text contains a clarification question before the JSON block.
 * A question mark in the prose (before any JSON fence or top-level brace) indicates
 * the worker wants to ask the orchestrator something.
 */
function workerNeedsClarification(rawText: string): string | null {
  // Find the start of the JSON portion
  const jsonFenceIdx = rawText.indexOf("```json");
  const firstBrace = rawText.indexOf("{");
  const jsonStart = jsonFenceIdx >= 0
    ? jsonFenceIdx
    : firstBrace >= 0
      ? firstBrace
      : rawText.length;

  const proseSection = rawText.substring(0, jsonStart);
  if (proseSection.includes("?")) {
    return proseSection.trim();
  }
  return null;
}

export async function runOrchestration(params: OrchestrationParams): Promise<void> {
  const orchestrator = getOrchestratorCompanion();

  // -------------------------------------------------------------------
  // Phase 1 -- Blueberry plans
  // -------------------------------------------------------------------

  const planSystemAddition = loadPrompt("orchestrator/plan");

  console.log(`[companion] ---- Phase 1: Planning ----`);
  console.log(`[companion] Orchestrator: ${orchestrator.name} (${orchestrator.id})`);
  console.log(`[companion] User message: ${params.userMessage}`);
  console.log(`[companion] Plan system addition: ${planSystemAddition}`);

  // Build planning input with optional conversation history
  let planningInput = params.userMessage;
  if (params.conversationHistory && params.conversationHistory.length > 0) {
    const historyBlock = params.conversationHistory
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    planningInput = `Previous conversation:\n${historyBlock}\n\nCurrent request: ${params.userMessage}`;
  }

  let planText: string;
  try {
    planText = await orchestratorStreamText(
      planSystemAddition,
      planningInput,
      orchestrator.systemPrompt,
      params.abortSignal,
    );
    console.log(`[companion] Plan raw response:\n${planText}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[companion] Plan generation failed: ${msg}`);
    emitMessage(
      params,
      { id: orchestrator.id, name: orchestrator.name, emoji: orchestrator.emoji },
      `I ran into a problem creating the plan: ${msg}`,
    );
    params.onFinalResponse(`Sorry, I couldn't process that request: ${msg}`);
    return;
  }

  let plan: TaskPlan;
  const parsedPlan = extractJSON(planText) as TaskPlan | null;
  if (parsedPlan && Array.isArray(parsedPlan.tasks)) {
    plan = parsedPlan;
    console.log(`[companion] Parsed plan: ${plan.tasks.length} task(s)`);
    for (const t of plan.tasks) {
      console.log(`[companion]   > ${t.companionId}: ${t.task} (${t.reason})`);
    }
  } else {
    console.warn(`[companion] Could not parse plan from LLM response, falling back to Ella`);
    // Fallback: single Ella task with the full user message
    plan = {
      tasks: [
        {
          companionId: "ella",
          task: params.userMessage,
          reason: "Fallback -- could not parse a structured plan",
        },
      ],
    };
  }

  // -------------------------------------------------------------------
  // Empty plan -- Blueberry answers directly, skip worker phase
  // -------------------------------------------------------------------
  if (plan.tasks.length === 0) {
    console.log(`[companion] Empty plan -- Blueberry answering directly`);

    const directPrompt = loadPrompt("orchestrator/direct");

    let directInput = `User message: ${params.userMessage}`;
    if (params.conversationHistory && params.conversationHistory.length > 0) {
      const historyBlock = params.conversationHistory
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      directInput = `Previous conversation:\n${historyBlock}\n\nCurrent message: ${params.userMessage}`;
    }

    let finalText: string;
    try {
      // No thinking events for direct responses -- the response IS the output,
      // not internal reasoning. Showing it as "thought" would duplicate the final message.
      finalText = await orchestratorStreamText(
        directPrompt,
        directInput,
        orchestrator.systemPrompt,
        params.abortSignal,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finalText = `Sorry, I had trouble responding: ${msg}`;
    }

    params.onCompanionEvent({
      type: "companion:done",
      fromId: orchestrator.id,
      fromName: orchestrator.name,
      fromEmoji: orchestrator.emoji,
      content: "Response complete",
      timestamp: Date.now(),
      isFinal: true,
    });

    params.onFinalResponse(finalText);
    return;
  }

  // -------------------------------------------------------------------
  // Phase 2 -- Workers execute (sequentially)
  // -------------------------------------------------------------------
  emitMessage(
    params,
    { id: orchestrator.id, name: orchestrator.name, emoji: orchestrator.emoji },
    "Let me break this down and get the right people on it.",
  );

  console.log(`[companion] ---- Phase 2: Worker Execution ----`);
  const results = new Map<string, CompanionRunResult>();

  for (const taskEntry of plan.tasks) {
    let worker: ReturnType<typeof getCompanion>;
    try {
      worker = getCompanion(taskEntry.companionId);
    } catch {
      console.warn(`[companion] Unknown companion "${taskEntry.companionId}" -- skipping`);
      continue;
    }

    // Sally delegates
    emitMessage(
      params,
      { id: orchestrator.id, name: orchestrator.name, emoji: orchestrator.emoji },
      `${worker.name}, ${taskEntry.task}`,
      { id: worker.id, name: worker.name },
    );

    // Run the worker
    console.log(`[companion] Dispatching ${worker.name} (${worker.id})...`);
    console.log(`[companion]   Task: ${taskEntry.task}`);
    const workerStartTime = Date.now();
    let result = await runWorker({
      companion: worker,
      task: taskEntry.task,
      context: {},
      deps: params.deps,
      onEvent: params.onCompanionEvent,
      abortSignal: params.abortSignal,
    });
    console.log(`[companion] ${worker.name} finished in ${Date.now() - workerStartTime}ms (success=${result.success})`);
    if (result.rawText) {
      console.log(`[companion] ${worker.name} raw output (first 1000 chars):\n${result.rawText.substring(0, 1000)}`);
    }
    if (result.error) {
      console.error(`[companion] ${worker.name} error: ${result.error}`);
    }

    // Check if the worker needs clarification
    const clarificationQuestion = workerNeedsClarification(result.rawText);
    if (clarificationQuestion && !result.success) {
      // Emit worker's clarification question
      params.onCompanionEvent({
        type: "companion:message",
        fromId: worker.id,
        fromName: worker.name,
        fromEmoji: worker.emoji,
        toId: orchestrator.id,
        toName: orchestrator.name,
        content: clarificationQuestion,
        timestamp: Date.now(),
      });

      // Blueberry answers the clarification
      let clarificationAnswer: string;
      try {
        clarificationAnswer = await orchestratorStreamText(
          "A worker companion is asking you for clarification. Answer concisely so they can proceed.",
          `Original user request: ${params.userMessage}\n\nWorker question: ${clarificationQuestion}`,
          orchestrator.systemPrompt,
          params.abortSignal,
        );
      } catch {
        clarificationAnswer = "Please do your best with the information available.";
      }

      emitMessage(
        params,
        { id: orchestrator.id, name: orchestrator.name, emoji: orchestrator.emoji },
        clarificationAnswer,
        { id: worker.id, name: worker.name },
      );

      // Re-run the worker with clarification added to context
      console.log(`[companion] Re-running ${worker.name} with clarification...`);
      const rerunStart = Date.now();
      result = await runWorker({
        companion: worker,
        task: taskEntry.task,
        context: { clarification: clarificationAnswer },
        deps: params.deps,
        onEvent: params.onCompanionEvent,
        abortSignal: params.abortSignal,
      });
      console.log(`[companion] ${worker.name} re-run finished in ${Date.now() - rerunStart}ms (success=${result.success})`);
    }

    results.set(worker.id, result);

    // Worker reports result back to orchestrator
    if (result.success) {
      emitMessage(
        params,
        { id: worker.id, name: worker.name, emoji: worker.emoji },
        `Done -- here are my results.`,
        { id: orchestrator.id, name: orchestrator.name },
      );
    } else {
      emitMessage(
        params,
        { id: worker.id, name: worker.name, emoji: worker.emoji },
        `I couldn't complete this: ${result.error ?? "unknown error"}`,
        { id: orchestrator.id, name: orchestrator.name },
      );
    }

    // Emit done event for this worker
    params.onCompanionEvent({
      type: "companion:done",
      fromId: worker.id,
      fromName: worker.name,
      fromEmoji: worker.emoji,
      content: result.success ? "Task complete" : `Failed: ${result.error ?? "unknown"}`,
      timestamp: Date.now(),
    });
  }

  // -------------------------------------------------------------------
  // Phase 3 — Blueberry synthesizes
  // -------------------------------------------------------------------
  console.log(`[companion] ---- Phase 3: Synthesis ----`);
  console.log(`[companion] Workers completed: ${results.size}`);
  for (const [cid, r] of results) {
    console.log(`[companion]   ${cid}: success=${r.success}, output=${r.structuredOutput ? 'yes' : 'no'}`);
  }
  params.onCompanionEvent({
    type: "companion:activity",
    fromId: orchestrator.id,
    fromName: orchestrator.name,
    fromEmoji: orchestrator.emoji,
    content: "analyzing results...",
    activity: "analyzing results...",
    timestamp: Date.now(),
  });

  // Build structured context from all worker results
  const workerResultsSummary: Record<string, unknown> = {};
  for (const [companionId, result] of results) {
    workerResultsSummary[companionId] = {
      success: result.success,
      data: result.structuredOutput,
      rawSummary: result.rawText.substring(0, 2000),
      error: result.error,
    };
  }

  const synthesisPrompt = loadPrompt("orchestrator/synthesis");

  const synthesisInput = `Original request: ${params.userMessage}\n\nTeam results:\n${JSON.stringify(workerResultsSummary, null, 2)}`;
  console.log(`[companion] Synthesis prompt: ${synthesisPrompt}`);
  console.log(`[companion] Synthesis input (first 2000 chars):\n${synthesisInput.substring(0, 2000)}`);

  let finalText: string;
  try {
    finalText = await orchestratorStreamText(
      synthesisPrompt,
      synthesisInput,
      orchestrator.systemPrompt,
      params.abortSignal,
      (accumulated) => {
        params.onCompanionEvent({
          type: "companion:thinking",
          fromId: orchestrator.id,
          fromName: orchestrator.name,
          fromEmoji: orchestrator.emoji,
          content: accumulated,
          timestamp: Date.now(),
        });
      },
    );
    console.log(`[companion] Final synthesis (first 1000 chars):\n${finalText.substring(0, 1000)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[companion] Synthesis failed: ${msg}`);
    finalText = `I collected results from the team but had trouble synthesizing them: ${msg}`;
  }

  // Emit orchestrator done
  params.onCompanionEvent({
    type: "companion:done",
    fromId: orchestrator.id,
    fromName: orchestrator.name,
    fromEmoji: orchestrator.emoji,
    content: "Synthesis complete",
    timestamp: Date.now(),
    isFinal: true,
  });

  console.log(`[companion] ---- Orchestration complete ----`);
  params.onFinalResponse(finalText);
}
