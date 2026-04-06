import { loadPrompt } from "../../prompts/loadPrompt";
import { catalogCompanionToDeclaration } from "../../../companionMarketplace/runtime";
import { getAllCompanions, getCompanion } from "../registry";
import { runWorker } from "../runner";
import type { CompanionDeclaration, CompanionRunResult } from "../types";
import { emitDone, emitMessage, toCompanionIdentity } from "./events";
import { buildClarificationInput } from "./inputs";
import {
  evaluateWorkerResult,
  streamOrchestratorText,
  workerNeedsClarification,
} from "./llm";
import type { OrchestrationParams, TaskPlan } from "./types";

const MAX_WORKER_RETRIES = 3;

async function rerunWorkerWithClarification(params: {
  worker: CompanionDeclaration;
  task: string;
  orchestrator: CompanionDeclaration;
  orchestration: OrchestrationParams;
  clarificationQuestion: string;
  availableWorkers: CompanionDeclaration[];
}): Promise<CompanionRunResult> {
  const {
    worker,
    task,
    orchestrator,
    orchestration,
    clarificationQuestion,
    availableWorkers,
  } = params;

  orchestration.onCompanionEvent({
    type: "companion:message",
    fromId: worker.id,
    fromName: worker.name,
    fromEmoji: worker.emoji,
    toId: orchestrator.id,
    toName: orchestrator.name,
    content: clarificationQuestion,
    timestamp: Date.now(),
  });

  let clarificationAnswer: string;
  try {
    const clarification = await streamOrchestratorText({
      router: orchestration.router,
      scope: "worker",
      systemAddition: loadPrompt("orchestrator/clarification"),
      userContent: buildClarificationInput(
        orchestration.userMessage,
        clarificationQuestion,
      ),
      orchestratorPrompt: orchestrator.systemPrompt,
      abortSignal: orchestration.abortSignal,
    });
    clarificationAnswer = clarification.text;
  } catch {
    clarificationAnswer = "Please do your best with the information available.";
  }

  emitMessage(
    orchestration,
    toCompanionIdentity(orchestrator),
    clarificationAnswer,
    { id: worker.id, name: worker.name },
  );

  console.log(`[companion] Re-running ${worker.name} with clarification...`);
  const rerunStart = Date.now();
  const result = await runWorker({
    companion: worker,
    task,
    context: { clarification: clarificationAnswer },
    deps: orchestration.deps,
    router: orchestration.router,
    onEvent: orchestration.onCompanionEvent,
    abortSignal: orchestration.abortSignal,
    availableWorkers,
  });
  console.log(
    `[companion] ${worker.name} re-run finished in ${Date.now() - rerunStart}ms (success=${result.success})`,
  );

  return result;
}

async function runWorkerWithQualityGate(params: {
  worker: CompanionDeclaration;
  task: string;
  orchestrator: CompanionDeclaration;
  orchestration: OrchestrationParams;
  availableWorkers: CompanionDeclaration[];
}): Promise<CompanionRunResult> {
  const { worker, task, orchestrator, orchestration, availableWorkers } =
    params;

  console.log(`[companion] Dispatching ${worker.name} (${worker.id})...`);
  console.log(`[companion]   Task: ${task}`);
  const workerStartTime = Date.now();
  let result = await runWorker({
    companion: worker,
    task,
    context: {},
    deps: orchestration.deps,
    router: orchestration.router,
    onEvent: orchestration.onCompanionEvent,
    abortSignal: orchestration.abortSignal,
    availableWorkers,
    scope:
      worker.id === orchestrator.id ? "chat" : "worker",
    previousOpenAIResponseId:
      worker.id === orchestrator.id
        ? orchestration.previousOpenAIResponseId
        : undefined,
  });
  console.log(
    `[companion] ${worker.name} finished in ${Date.now() - workerStartTime}ms (success=${result.success})`,
  );

  if (result.rawText) {
    console.log(
      `[companion] ${worker.name} raw output (first 1000 chars):\n${result.rawText.substring(0, 1000)}`,
    );
  }

  if (result.error) {
    console.error(`[companion] ${worker.name} error: ${result.error}`);
  }

  const clarificationQuestion = workerNeedsClarification(result.rawText);
  if (clarificationQuestion && !result.success) {
    result = await rerunWorkerWithClarification({
      worker,
      task,
      orchestrator,
      orchestration,
      clarificationQuestion,
      availableWorkers,
    });
  }

  let attempt = 0;
  let finalResult = result;

  while (attempt < MAX_WORKER_RETRIES) {
    let needsRetry = false;
    let retryFeedback = "";

    if (!finalResult.success) {
      needsRetry = true;
      retryFeedback =
        finalResult.error ??
        "Most fields are null or empty - you need to find more data.";
    } else {
      const evaluation = await evaluateWorkerResult({
        task,
        result: finalResult,
      });

      if (evaluation.accepted) break;

      needsRetry = true;
      retryFeedback = evaluation.feedback;
    }

    if (!needsRetry) break;

    attempt++;
    console.log(
      `[companion] ${worker.name} result rejected (attempt ${attempt}/${MAX_WORKER_RETRIES}): ${retryFeedback}`,
    );
    if (attempt >= MAX_WORKER_RETRIES) break;

    emitMessage(
      orchestration,
      toCompanionIdentity(orchestrator),
      `That's not quite right - ${retryFeedback}`,
      { id: worker.id, name: worker.name },
    );

    emitMessage(
      orchestration,
      toCompanionIdentity(orchestrator),
      `Let me send ${worker.name} back to dig deeper (attempt ${attempt + 1}/${MAX_WORKER_RETRIES})`,
    );

    const retryStart = Date.now();
    finalResult = await runWorker({
      companion: worker,
      task,
      context: {
        previousAttempt: finalResult.structuredOutput,
        previousRawSummary:
          finalResult.structuredOutput == null
            ? finalResult.rawText.slice(0, 1500)
            : undefined,
        feedback: retryFeedback,
        instruction: `Your previous attempt was rejected. ${retryFeedback}. Try a different approach than before.`,
      },
      deps: orchestration.deps,
      router: orchestration.router,
      onEvent: orchestration.onCompanionEvent,
      abortSignal: orchestration.abortSignal,
      availableWorkers,
      scope:
        worker.id === orchestrator.id ? "chat" : "worker",
      previousOpenAIResponseId:
        worker.id === orchestrator.id
          ? orchestration.previousOpenAIResponseId
          : undefined,
    });
    console.log(
      `[companion] ${worker.name} retry #${attempt + 1} finished in ${Date.now() - retryStart}ms (success=${finalResult.success})`,
    );
  }

  return finalResult;
}

export async function executeTaskPlan(params: {
  orchestration: OrchestrationParams;
  plan: TaskPlan;
  orchestrator: CompanionDeclaration;
}): Promise<Map<string, CompanionRunResult>> {
  const { orchestration, plan, orchestrator } = params;
  const results = new Map<string, CompanionRunResult>();
  const coreWorkers = getAllCompanions().filter((companion) => companion.role === "worker");
  const resolvedTasks = plan.tasks
    .map((taskEntry) => {
      if (taskEntry.companionKind === "marketplace") {
        const published =
          orchestration.marketplaceService.getPublishedMarketplaceCompanion(
            taskEntry.companionId,
          );
        if (!published) {
          console.warn(
            `[companion] Unknown marketplace companion "${taskEntry.companionId}" - skipping`,
          );
          return null;
        }

        return {
          taskEntry,
          worker: catalogCompanionToDeclaration({
            companion: published,
            availableWorkers: coreWorkers,
          }),
        };
      }

      try {
        return {
          taskEntry,
          worker: getCompanion(taskEntry.companionId),
        };
      } catch {
        console.warn(
          `[companion] Unknown core companion "${taskEntry.companionId}" - skipping`,
        );
        return null;
      }
    })
    .filter(
      (
        entry,
      ): entry is {
        taskEntry: TaskPlan["tasks"][number];
        worker: CompanionDeclaration;
      } => entry !== null,
    );

  const availableWorkers = [...coreWorkers];
  for (const entry of resolvedTasks) {
    if (entry.worker.role !== "worker") continue;
    if (availableWorkers.some((worker) => worker.id === entry.worker.id)) continue;
    availableWorkers.push(entry.worker);
  }

  console.log("[companion] ---- Phase 2: Worker Execution ----");

  for (const entry of resolvedTasks) {
    const { taskEntry, worker } = entry;

    if (worker.id !== orchestrator.id) {
      emitMessage(
        orchestration,
        toCompanionIdentity(orchestrator),
        `${worker.name}, ${taskEntry.task}`,
        { id: worker.id, name: worker.name },
      );
    }

    const finalResult = await runWorkerWithQualityGate({
      worker,
      task: taskEntry.task,
      orchestrator,
      orchestration,
      availableWorkers,
    });

    results.set(
      `${taskEntry.companionKind ?? "core"}:${worker.id}`,
      finalResult,
    );

    if (worker.id !== orchestrator.id) {
      emitMessage(
        orchestration,
        toCompanionIdentity(worker),
        finalResult.success
          ? "Done - here are my results."
          : `I couldn't complete this: ${finalResult.error ?? "unknown error"}`,
        { id: orchestrator.id, name: orchestrator.name },
      );
    }

    emitDone(
      orchestration,
      worker,
      finalResult.success
        ? "Task complete"
        : `Failed: ${finalResult.error ?? "unknown"}`,
      worker.id === orchestrator.id && plan.tasks.length === 1,
    );
  }

  return results;
}
