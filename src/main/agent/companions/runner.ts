import {
  ToolLoopAgent,
  stepCountIs,
  type ModelMessage,
  tool as defineTool,
} from "ai";
import { z } from "zod";
import { createBrowserTools, type BrowserToolDeps } from "../browserTools";
import {
  type LLMRouter,
  type LLMRunScope,
  safeTemperatureForRoute,
} from "../llmRouter";
import { loadPromptWithVars } from "../prompts/loadPrompt";
import { createStreamAggregator } from "../streamAggregation";
import { getCompanion, getAllCompanions } from "./registry";
import type {
  CompanionDeclaration,
  CompanionEvent,
  CompanionRunResult,
} from "./types";

/**
 * Try to extract the last JSON object or ```json block from text.
 */
export function extractJSON(text: string): unknown | null {
  const fencedMatches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (fencedMatches.length > 0) {
    const last = fencedMatches[fencedMatches.length - 1][1].trim();
    try {
      return JSON.parse(last);
    } catch {
      // fall through
    }
  }

  let depth = 0;
  let start = -1;
  let lastStart = -1;
  let lastEnd = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        lastStart = start;
        lastEnd = i + 1;
        start = -1;
      }
    }
  }

  if (lastStart >= 0 && lastEnd > lastStart) {
    try {
      return JSON.parse(text.substring(lastStart, lastEnd));
    } catch {
      // fall through
    }
  }

  depth = 0;
  start = -1;
  lastStart = -1;
  lastEnd = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && start >= 0) {
        lastStart = start;
        lastEnd = i + 1;
        start = -1;
      }
    }
  }

  if (lastStart >= 0 && lastEnd > lastStart) {
    try {
      return JSON.parse(text.substring(lastStart, lastEnd));
    } catch {
      // fall through
    }
  }

  return null;
}

function extractLeafValues(obj: Record<string, unknown>): unknown[] {
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (
      lk === "name" ||
      lk === "comment" ||
      lk === "comments" ||
      lk === "note" ||
      lk === "notes" ||
      lk === "suggestions" ||
      lk === "label" ||
      lk === "id" ||
      lk === "source"
    ) {
      continue;
    }
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      values.push(...extractLeafValues(val as Record<string, unknown>));
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== null && typeof item === "object") {
          values.push(...extractLeafValues(item as Record<string, unknown>));
        } else {
          values.push(item);
        }
      }
    } else {
      values.push(val);
    }
  }
  return values;
}

function isSemanticSuccess(parsed: unknown): boolean {
  if (parsed === null) return false;
  if (typeof parsed !== "object") return false;

  if (Array.isArray(parsed)) {
    return parsed.length > 0;
  }

  const leaves = extractLeafValues(parsed as Record<string, unknown>);
  if (leaves.length === 0) return false;
  const nullCount = leaves.filter((v) => v === null || v === undefined).length;
  const nullRatio = nullCount / leaves.length;
  return nullRatio < 0.8;
}

export const MAX_DELEGATION_DEPTH = 3;

export async function runWorker(params: {
  companion: CompanionDeclaration;
  task: string;
  context: unknown;
  deps: BrowserToolDeps;
  router: LLMRouter;
  onEvent: (event: CompanionEvent) => void;
  abortSignal?: AbortSignal;
  availableWorkers?: CompanionDeclaration[];
  delegationDepth?: number;
  scope?: LLMRunScope;
  previousOpenAIResponseId?: string | null;
}): Promise<CompanionRunResult> {
  const {
    companion,
    task,
    context,
    deps,
    router,
    onEvent,
    abortSignal,
    availableWorkers,
    delegationDepth = 0,
    scope = "worker",
    previousOpenAIResponseId,
  } = params;

  const route = router.resolve(scope, { previousOpenAIResponseId });

  const companionInfo = {
    id: companion.id,
    name: companion.name,
    emoji: companion.emoji,
  };
  deps.setActiveCompanion?.(companionInfo);
  const companionDeps = {
    ...deps,
    activeCompanion: companionInfo,
  };
  const allTools = createBrowserTools(companionDeps);
  const filteredTools: Record<string, (typeof allTools)[keyof typeof allTools]> =
    {};
  for (const toolName of companion.toolset) {
    if (toolName in allTools) {
      filteredTools[toolName] = allTools[toolName as keyof typeof allTools];
    }
  }

  const MIN_OWN_EFFORT_FOR_DELEGATION = 15;
  let ownToolCallCount = 0;

  if (
    companion.toolset.includes("delegate") &&
    delegationDepth < MAX_DELEGATION_DEPTH
  ) {
    const roster = availableWorkers ?? getAllCompanions();
    const otherCompanions = roster.filter(
      (c) => c.id !== companion.id && c.role === "worker",
    );
    const companionList = otherCompanions
      .map(
        (c) =>
          `${c.emoji} ${c.name} (${c.id}): ${c.capabilities.join(", ")}`,
      )
      .join("\n");

    (filteredTools as Record<string, unknown>).delegate = defineTool({
      description: [
        "Ask another team member to help with a sub-task. They will do the work and return their results to you.",
        `Available team members:\n${companionList}`,
        "Use this when a task requires a different specialist's skills, or when you want to parallelize work.",
        "The delegate will have full browser access and return structured results.",
      ].join("\n"),
      inputSchema: z.object({
        companionId: z
          .string()
          .describe(
            "ID of the companion to delegate to (e.g. 'ella', 'sally', 'camille')",
          ),
        task: z
          .string()
          .describe("Clear, specific description of what you need them to do"),
        context: z
          .string()
          .optional()
          .describe("Any context or data they need (e.g. URLs, previous findings)"),
      }),
      execute: async ({ companionId, task: subTask, context: subContext }) => {
        if (ownToolCallCount < MIN_OWN_EFFORT_FOR_DELEGATION) {
          return `Error: You need to do more research yourself before delegating. You've only made ${ownToolCallCount} tool calls - do at least ${MIN_OWN_EFFORT_FOR_DELEGATION} yourself first. Use your browser tools to gather data, then delegate specific sub-tasks you can't handle.`;
        }

        let target: CompanionDeclaration;
        try {
          target = getCompanion(companionId);
        } catch {
          return `Error: Unknown companion "${companionId}". Available: ${otherCompanions.map((c) => c.id).join(", ")}`;
        }

        if (target.id === companion.id) {
          return "Error: You cannot delegate to yourself.";
        }

        onEvent({
          type: "companion:message",
          fromId: companion.id,
          fromName: companion.name,
          fromEmoji: companion.emoji,
          toId: target.id,
          toName: target.name,
          content: subTask,
          timestamp: Date.now(),
        });

        console.log(
          `[companion:delegate] ${companion.name} -> ${target.name}: ${subTask.substring(0, 200)}`,
        );

        const result = await runWorker({
          companion: target,
          task: subTask,
          context: subContext
            ? { fromCompanion: companion.name, info: subContext }
            : {},
          deps,
          router,
          onEvent,
          abortSignal,
          availableWorkers: roster,
          delegationDepth: delegationDepth + 1,
        });

        onEvent({
          type: "companion:message",
          fromId: target.id,
          fromName: target.name,
          fromEmoji: target.emoji,
          toId: companion.id,
          toName: companion.name,
          content: result.success
            ? `Done. ${result.rawText.substring(0, 200)}...`
            : `Failed: ${result.error ?? "unknown error"}`,
          timestamp: Date.now(),
        });

        if (!result.success) {
          return `${target.name} failed: ${result.error ?? "unknown error"}\nRaw output: ${result.rawText.substring(0, 500)}`;
        }

        if (result.structuredOutput) {
          return JSON.stringify(result.structuredOutput, null, 2);
        }
        return result.rawText;
      },
    });
  }

  const userMessage = loadPromptWithVars("worker/task", {
    task,
    context: JSON.stringify(context, null, 2),
  });

  console.log(`[companion:worker] --- ${companion.name} (${companion.id}) starting ---`);
  console.log(
    `[companion:worker] Route: ${route.provider}/${route.model} [${route.scope}]`,
  );
  console.log(
    `[companion:worker] Tools: [${Object.keys(filteredTools).join(", ")}]`,
  );
  console.log(
    `[companion:worker] System prompt (first 500 chars): ${companion.systemPrompt.substring(0, 500)}`,
  );
  console.log(`[companion:worker] User message: ${userMessage}`);
  console.log(
    `[companion:worker] Temperature: ${companion.temperature}, Max steps: ${companion.maxSteps}`,
  );

  try {
    let capturedResult: unknown = null;

    (filteredTools as Record<string, unknown>).submit_result = defineTool({
      description: [
        "Submit your final structured results. You MUST call this tool when you are done researching.",
        "Pass your findings as a JSON object in the `data` parameter.",
        "Do NOT write your results as text - always use this tool to submit them.",
        "Only call this once, when you have completed all your research.",
      ].join(" "),
      inputSchema: z.object({
        data: z.unknown().describe("Your structured results as a JSON object"),
      }),
      execute: async ({ data }) => {
        capturedResult = data;
        return "Result submitted successfully. You can now write a brief summary if you like.";
      },
    });

    const MAX_CONTINUATIONS = 3;
    const MIN_EFFORT_RATIO = 0.15;

    let messages: ModelMessage[] = [
      { role: "user" as const, content: userMessage },
    ];
    let accumulatedText = "";
    let toolCallCount = 0;
    let responseId: string | null = null;

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const isFirstRound = round === 0;
      const agent = new ToolLoopAgent({
        model: route.modelInstance,
        instructions: companion.systemPrompt,
        tools: filteredTools,
        stopWhen: stepCountIs(
          isFirstRound
            ? companion.maxSteps
            : Math.max(companion.maxSteps - toolCallCount, 50),
        ),
        temperature: safeTemperatureForRoute(route, companion.temperature),
        providerOptions: route.providerOptions,
      });

      const result = await agent.stream({
        messages,
        abortSignal,
      });

      let roundToolCalls = 0;
      const aggregate = createStreamAggregator({
        onReasoningDelta: (accumulated) => {
          onEvent({
            type: "companion:thinking",
            fromId: companion.id,
            fromName: companion.name,
            fromEmoji: companion.emoji,
            content: accumulated,
            timestamp: Date.now(),
          });
        },
      });

      for await (const part of result.fullStream) {
        aggregate.consume(part);
        if (part.type === "text-delta") {
          accumulatedText += part.text;
        } else if (part.type === "tool-call") {
          toolCallCount++;
          roundToolCalls++;
          if (
            part.toolName !== "delegate" &&
            part.toolName !== "submit_result"
          ) {
            ownToolCallCount++;
          }
          console.log(
            `[companion:worker] ${companion.name} tool-call #${toolCallCount}: ${part.toolName}(${JSON.stringify((part as Record<string, unknown>).args ?? (part as Record<string, unknown>).input).substring(0, 300)})`,
          );
          const args =
            (part as Record<string, unknown>).args ??
            (part as Record<string, unknown>).input ??
            {};
          const toolTabId = (args as Record<string, unknown>).tabId as
            | string
            | undefined;
          const toolUrl = (args as Record<string, unknown>).url as
            | string
            | undefined;
          let activity: string;
          let activityTabUrl: string | undefined;
          switch (part.toolName) {
            case "navigate":
            case "open_tab": {
              const url = String(toolUrl ?? "");
              try {
                activity = `browsing ${new URL(url).hostname.replace("www.", "")}...`;
                activityTabUrl = new URL(url).hostname.replace("www.", "");
              } catch {
                activity = "browsing...";
              }
              break;
            }
            case "read_page":
              activity = "reading page structure...";
              break;
            case "get_page_text":
              activity = "reading page content...";
              break;
            case "find":
              activity = "searching page...";
              break;
            case "click":
              activity = "clicking...";
              break;
            case "type":
              activity = "typing...";
              break;
            case "screenshot":
              activity = "taking screenshot...";
              break;
            case "javascript":
              activity = "running script...";
              break;
            case "extract":
              activity = "extracting data...";
              break;
            case "submit_result":
              activity = "submitting results...";
              break;
            case "delegate": {
              const delegateId = String(
                (args as Record<string, unknown>).companionId ?? "",
              );
              try {
                const target = getCompanion(delegateId);
                activity = `asking ${target.emoji} ${target.name} for help...`;
              } catch {
                activity = "delegating...";
              }
              break;
            }
            default:
              activity = `using ${part.toolName}...`;
          }
          onEvent({
            type: "companion:activity",
            fromId: companion.id,
            fromName: companion.name,
            fromEmoji: companion.emoji,
            content: activity,
            activity,
            tabId: toolTabId,
            tabUrl: activityTabUrl,
            timestamp: Date.now(),
          });
        } else if (part.type === "tool-result") {
          const rawResult =
            (part as Record<string, unknown>).result ??
            (part as Record<string, unknown>).output;
          const resultStr =
            typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult);
          console.log(
            `[companion:worker] ${companion.name} tool-result #${toolCallCount}: ${resultStr.substring(0, 500)}`,
          );
        }
      }

      responseId =
        aggregate.finalize(
          (await result.providerMetadata) as Record<string, unknown> | undefined,
        ).responseId ?? responseId;

      console.log(
        `[companion:worker] ${companion.name} round ${round + 1} done -- ${roundToolCalls} tool calls this round, ${toolCallCount} total, ${accumulatedText.length} chars`,
      );

      const effortRatio = toolCallCount / companion.maxSteps;

      if (capturedResult !== null) {
        const leaves = extractLeafValues(
          typeof capturedResult === "object" &&
            capturedResult !== null &&
            !Array.isArray(capturedResult)
            ? (capturedResult as Record<string, unknown>)
            : { root: capturedResult },
        );
        const nullCount = leaves.filter(
          (v) => v === null || v === undefined,
        ).length;
        const nullRatio = leaves.length > 0 ? nullCount / leaves.length : 0;

        const minEffortMet = effortRatio >= 0.1;
        const goodQuality = nullRatio <= 0.5;
        const decentEffort = effortRatio >= 0.2;

        if (
          round >= MAX_CONTINUATIONS ||
          (goodQuality && minEffortMet) ||
          decentEffort
        ) {
          console.log(
            `[companion:worker] ${companion.name} submitted result via submit_result (nullRatio=${Math.round(nullRatio * 100)}%, effort=${Math.round(effortRatio * 100)}%)`,
          );
          break;
        }

        console.log(
          `[companion:worker] ${companion.name} submitted too early with poor data (nullRatio=${Math.round(nullRatio * 100)}%, effort=${Math.round(effortRatio * 100)}%). Rejecting and continuing...`,
        );
        capturedResult = null;

        const resp = await result.response;
        const responseMessages = resp.messages;

        messages = [
          { role: "user" as const, content: userMessage },
          ...(responseMessages as ModelMessage[]),
          {
            role: "user" as const,
            content: `Your submission was rejected because ${Math.round(nullRatio * 100)}% of fields are null/empty, and you only used ${toolCallCount}/${companion.maxSteps} steps (${Math.round(effortRatio * 100)}%).\n\nDo NOT call submit_result yet. Continue researching:\n- Visit each company/item's actual website\n- Search for specific data points (MRR, ARR, revenue, funding)\n- Try multiple search queries if the first doesn't work\n- You have ${companion.maxSteps - toolCallCount} steps remaining - use them\n\nWhen you have real data for most fields, THEN call submit_result.`,
          },
        ];
        accumulatedText = "";
        continue;
      }

      if (round < MAX_CONTINUATIONS) {
        if (effortRatio < MIN_EFFORT_RATIO && roundToolCalls > 0) {
          console.log(
            `[companion:worker] ${companion.name} stopped too early without submitting (${toolCallCount}/${companion.maxSteps} steps = ${Math.round(effortRatio * 100)}%). Injecting continuation...`,
          );

          const resp = await result.response;
          const responseMessages = resp.messages;

          messages = [
            { role: "user" as const, content: userMessage },
            ...(responseMessages as ModelMessage[]),
            {
              role: "user" as const,
              content:
                `You stopped after only ${toolCallCount} tool calls out of ${companion.maxSteps} available, and you did NOT call submit_result.\n\nDo NOT write your findings as text. Continue researching, then call submit_result({ data: { ... } }) with your structured findings.\n\nRemember:\n- Visit actual pages, not just Google snippets\n- Search for each item's specific data points\n- Only call submit_result when you have real data`,
            },
          ];
          accumulatedText = "";
          continue;
        }

        if (roundToolCalls > 0) {
          console.log(
            `[companion:worker] ${companion.name} finished work but forgot to call submit_result. Nudging...`,
          );

          const resp = await result.response;
          const responseMessages = resp.messages;

          messages = [
            { role: "user" as const, content: userMessage },
            ...(responseMessages as ModelMessage[]),
            {
              role: "user" as const,
              content:
                "You did good research but forgot to call submit_result. Call submit_result({ data: { ... } }) now with your findings as structured data.",
            },
          ];
          accumulatedText = "";
          continue;
        }
      }

      break;
    }

    console.log(
      `[companion:worker] ${companion.name} finished -- ${toolCallCount} tool call(s), ${accumulatedText.length} chars output`,
    );
    console.log(
      `[companion:worker] ${companion.name} full output:\n${accumulatedText.substring(0, 2000)}`,
    );

    const structured = capturedResult ?? extractJSON(accumulatedText);
    const semanticOk = isSemanticSuccess(structured);

    return {
      companionId: companion.id,
      companionName: companion.name,
      companionKind: companion.source === "community" ? "marketplace" : "core",
      structuredOutput: structured,
      rawText: accumulatedText,
      messages: [],
      success: capturedResult !== null || semanticOk,
      toolCallCount,
      maxSteps: companion.maxSteps,
      responseId,
      error:
        structured === null
          ? "Could not extract structured results - worker did not call submit_result"
          : !semanticOk
            ? "Worker returned data but most fields were null or empty"
            : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[companion:worker] ${companion.name} error: ${errorMsg}`);
    if (errorMsg.includes("abort")) {
      return {
        companionId: companion.id,
        companionName: companion.name,
        companionKind: companion.source === "community" ? "marketplace" : "core",
        structuredOutput: null,
        rawText: "",
        messages: [],
        success: false,
        error: "Aborted",
      };
    }
    return {
      companionId: companion.id,
      companionName: companion.name,
      companionKind: companion.source === "community" ? "marketplace" : "core",
      structuredOutput: null,
      rawText: "",
      messages: [],
      success: false,
      error: errorMsg,
    };
  }
}
