import { streamText, stepCountIs, type CoreMessage, tool as defineTool } from "ai";
import { z } from "zod";
import { createBrowserTools, type BrowserToolDeps } from "../browserTools";
import { createModel, getModelName, getProvider } from "../modelProvider";
import { loadPromptWithVars } from "../prompts/loadPrompt";
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
  // Try fenced ```json blocks (last one wins)
  const fencedMatches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (fencedMatches.length > 0) {
    const last = fencedMatches[fencedMatches.length - 1][1].trim();
    try {
      return JSON.parse(last);
    } catch {
      // fall through
    }
  }

  // Try to find the last top-level { ... } block
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

  // Try to find the last [ ... ] block
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
    // Skip metadata-like keys that are always populated (names, comments, labels)
    // so they don't inflate the non-null ratio and mask missing data
    const lk = key.toLowerCase();
    if (lk === "name" || lk === "comment" || lk === "comments" || lk === "note" || lk === "notes" || lk === "suggestions" || lk === "label" || lk === "id" || lk === "source") {
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

  // Check if it's an array
  if (Array.isArray(parsed)) {
    return parsed.length > 0;
  }

  // For objects, check if ALL values at every level are null
  // If more than 80% of leaf values are null, treat as failure
  const leaves = extractLeafValues(parsed as Record<string, unknown>);
  if (leaves.length === 0) return false;
  const nullCount = leaves.filter((v) => v === null || v === undefined).length;
  const nullRatio = nullCount / leaves.length;
  return nullRatio < 0.8; // fail if 80%+ of values are null
}

export const MAX_DELEGATION_DEPTH = 3;

export async function runWorker(params: {
  companion: CompanionDeclaration;
  task: string;
  context: unknown;
  deps: BrowserToolDeps;
  onEvent: (event: CompanionEvent) => void;
  abortSignal?: AbortSignal;
  availableWorkers?: CompanionDeclaration[];
  /** Current delegation depth — 0 for top-level workers, increments for sub-delegations */
  delegationDepth?: number;
}): Promise<CompanionRunResult> {
  const {
    companion,
    task,
    context,
    deps,
    onEvent,
    abortSignal,
    availableWorkers,
    delegationDepth = 0,
  } = params;

  const provider = getProvider();
  const modelName = getModelName(provider);
  const model = createModel(provider, modelName);

  if (!model) {
    return {
      companionId: companion.id,
      companionName: companion.name,
      companionKind: companion.source === "community" ? "marketplace" : "core",
      structuredOutput: null,
      rawText: "",
      messages: [],
      success: false,
      error: "LLM model not configured",
    };
  }

  // Build filtered tool set from browser tools, with companion identity attached
  const companionInfo = { id: companion.id, name: companion.name, emoji: companion.emoji };
  deps.setActiveCompanion?.(companionInfo);
  const companionDeps = {
    ...deps,
    activeCompanion: companionInfo,
  };
  const allTools = createBrowserTools(companionDeps);
  const filteredTools: Record<string, (typeof allTools)[keyof typeof allTools]> = {};
  for (const toolName of companion.toolset) {
    if (toolName in allTools) {
      filteredTools[toolName] = allTools[toolName as keyof typeof allTools];
    }
  }

  // Add delegate tool if depth allows and companion has it in their toolset.
  // The tool is gated: it only works after the worker has made >= MIN_OWN_EFFORT
  // tool calls themselves, preventing delegation as an escape hatch.
  const MIN_OWN_EFFORT_FOR_DELEGATION = 15;
  let ownToolCallCount = 0; // tracks non-delegate tool calls

  if (companion.toolset.includes("delegate") && delegationDepth < MAX_DELEGATION_DEPTH) {
    const roster = availableWorkers ?? getAllCompanions();
    const otherCompanions = roster.filter(c => c.id !== companion.id && c.role === "worker");
    const companionList = otherCompanions.map(c => `${c.emoji} ${c.name} (${c.id}): ${c.capabilities.join(", ")}`).join("\n");
    
    (filteredTools as Record<string, unknown>).delegate = defineTool({
      description: [
        `Ask another team member to help with a sub-task. They will do the work and return their results to you.`,
        `Available team members:\n${companionList}`,
        `Use this when a task requires a different specialist's skills, or when you want to parallelize work.`,
        `The delegate will have full browser access and return structured results.`,
      ].join("\n"),
      inputSchema: z.object({
        companionId: z.string().describe("ID of the companion to delegate to (e.g. 'ella', 'sally', 'camille')"),
        task: z.string().describe("Clear, specific description of what you need them to do"),
        context: z.string().optional().describe("Any context or data they need (e.g. URLs, previous findings)"),
      }),
      execute: async ({ companionId, task: subTask, context: subContext }) => {
        // Block delegation until the worker has done meaningful work themselves
        if (ownToolCallCount < MIN_OWN_EFFORT_FOR_DELEGATION) {
          return `Error: You need to do more research yourself before delegating. You've only made ${ownToolCallCount} tool calls — do at least ${MIN_OWN_EFFORT_FOR_DELEGATION} yourself first. Use your browser tools to gather data, then delegate specific sub-tasks you can't handle.`;
        }

        let target: CompanionDeclaration;
        try {
          target = getCompanion(companionId);
        } catch {
          return `Error: Unknown companion "${companionId}". Available: ${otherCompanions.map(c => c.id).join(", ")}`;
        }

        if (target.id === companion.id) {
          return "Error: You cannot delegate to yourself.";
        }

        // Emit delegation event so the UI shows the handoff
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

        console.log(`[companion:delegate] ${companion.name} → ${target.name}: ${subTask.substring(0, 200)}`);

        const result = await runWorker({
          companion: target,
          task: subTask,
          context: subContext ? { fromCompanion: companion.name, info: subContext } : {},
          deps,
          onEvent,
          abortSignal,
          availableWorkers: roster,
          delegationDepth: delegationDepth + 1,
        });

        // Emit completion event
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

        // Return structured output if available, otherwise raw text
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
  console.log(`[companion:worker] Tools: [${Object.keys(filteredTools).join(", ")}]`);
  console.log(`[companion:worker] System prompt (first 500 chars): ${companion.systemPrompt.substring(0, 500)}`);
  console.log(`[companion:worker] User message: ${userMessage}`);
  console.log(`[companion:worker] Temperature: ${companion.temperature}, Max steps: ${companion.maxSteps}`);

  try {
    // submit_result tool — the model MUST call this to submit its final answer.
    // This is the Claude Code "StructuredOutput" pattern: structured data goes
    // through a tool call, not prose text. The tool captures the data into
    // `capturedResult` so we can extract it reliably.
    let capturedResult: unknown = null;

    (filteredTools as Record<string, unknown>).submit_result = defineTool({
      description: [
        "Submit your final structured results. You MUST call this tool when you are done researching.",
        "Pass your findings as a JSON object in the `data` parameter.",
        "Do NOT write your results as text — always use this tool to submit them.",
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

    // Continuation loop — like Claude Code's query loop.
    // After each streamText pass, check if the model submitted a result via
    // the submit_result tool. If not, inject a continuation message.
    const MAX_CONTINUATIONS = 3;
    const MIN_EFFORT_RATIO = 0.15;

    let messages: CoreMessage[] = [{ role: "user" as const, content: userMessage }];
    let accumulatedText = "";
    let thinkingText = "";
    let toolCallCount = 0;

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const isFirstRound = round === 0;
      const result = streamText({
        model,
        system: companion.systemPrompt,
        messages,
        tools: filteredTools,
        stopWhen: stepCountIs(isFirstRound ? companion.maxSteps : Math.max(companion.maxSteps - toolCallCount, 50)),
        temperature: companion.temperature,
        maxRetries: 2,
        abortSignal,
      });

      let roundToolCalls = 0;
      thinkingText = "";

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          accumulatedText += part.text;
          thinkingText += part.text;
          onEvent({
            type: "companion:thinking",
            fromId: companion.id,
            fromName: companion.name,
            fromEmoji: companion.emoji,
            content: thinkingText,
            timestamp: Date.now(),
          });
        } else if (part.type === "tool-call") {
          thinkingText = "";
          toolCallCount++;
          roundToolCalls++;
          if (part.toolName !== "delegate" && part.toolName !== "submit_result") {
            ownToolCallCount++;
          }
          console.log(`[companion:worker] ${companion.name} tool-call #${toolCallCount}: ${part.toolName}(${JSON.stringify((part as Record<string, unknown>).args ?? (part as Record<string, unknown>).input).substring(0, 300)})`);
          const args = (part as Record<string, unknown>).args ?? (part as Record<string, unknown>).input ?? {};
          const toolTabId = (args as Record<string, unknown>).tabId as string | undefined;
          const toolUrl = (args as Record<string, unknown>).url as string | undefined;
          let activity: string;
          let activityTabUrl: string | undefined;
          switch (part.toolName) {
            case "navigate":
            case "open_tab": {
              const url = String(toolUrl ?? "");
              try { activity = `browsing ${new URL(url).hostname.replace("www.", "")}...`; activityTabUrl = new URL(url).hostname.replace("www.", ""); } catch { activity = "browsing..."; }
              break;
            }
            case "read_page": activity = "reading page structure..."; break;
            case "get_page_text": activity = "reading page content..."; break;
            case "find": activity = "searching page..."; break;
            case "click": activity = "clicking..."; break;
            case "type": activity = "typing..."; break;
            case "screenshot": activity = "taking screenshot..."; break;
            case "javascript": activity = "running script..."; break;
            case "extract": activity = "extracting data..."; break;
            case "submit_result": activity = "submitting results..."; break;
            case "delegate": {
              const delegateId = String((args as Record<string, unknown>).companionId ?? "");
              try {
                const target = getCompanion(delegateId);
                activity = `asking ${target.emoji} ${target.name} for help...`;
              } catch {
                activity = "delegating...";
              }
              break;
            }
            default: activity = `using ${part.toolName}...`;
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
          const rawResult = (part as Record<string, unknown>).result ?? (part as Record<string, unknown>).output;
          const resultStr = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult);
          console.log(`[companion:worker] ${companion.name} tool-result #${toolCallCount}: ${resultStr.substring(0, 500)}`);
        }
      }

      console.log(`[companion:worker] ${companion.name} round ${round + 1} done -- ${roundToolCalls} tool calls this round, ${toolCallCount} total, ${accumulatedText.length} chars`);

      const effortRatio = toolCallCount / companion.maxSteps;

      // If model called submit_result, validate quality before accepting
      if (capturedResult !== null) {
        const leaves = extractLeafValues(
          typeof capturedResult === "object" && capturedResult !== null && !Array.isArray(capturedResult)
            ? (capturedResult as Record<string, unknown>)
            : { root: capturedResult },
        );
        const nullCount = leaves.filter(v => v === null || v === undefined).length;
        const nullRatio = leaves.length > 0 ? nullCount / leaves.length : 0;

        // Accept if:
        // - Exhausted continuations (last resort)
        // - Good data quality AND reasonable effort
        // Reject if effort is very low (< 10%) even with 0% null — likely
        // just parroting delegated results without doing own work
        const minEffortMet = effortRatio >= 0.1;
        const goodQuality = nullRatio <= 0.5;
        const decentEffort = effortRatio >= 0.2;

        if (round >= MAX_CONTINUATIONS || (goodQuality && minEffortMet) || decentEffort) {
          console.log(`[companion:worker] ${companion.name} submitted result via submit_result (nullRatio=${Math.round(nullRatio * 100)}%, effort=${Math.round(effortRatio * 100)}%)`);
          break;
        }

        // Quality is poor and effort is low — reject and push to keep researching
        console.log(`[companion:worker] ${companion.name} submitted too early with poor data (nullRatio=${Math.round(nullRatio * 100)}%, effort=${Math.round(effortRatio * 100)}%). Rejecting and continuing...`);
        capturedResult = null; // reset so they must submit again

        const resp = await result.response;
        const responseMessages = resp.messages;

        messages = [
          { role: "user" as const, content: userMessage },
          ...(responseMessages as CoreMessage[]),
          { role: "user" as const, content: `Your submission was rejected because ${Math.round(nullRatio * 100)}% of fields are null/empty, and you only used ${toolCallCount}/${companion.maxSteps} steps (${Math.round(effortRatio * 100)}%).\n\nDo NOT call submit_result yet. Continue researching:\n- Visit each company/item's actual website\n- Search for specific data points (MRR, ARR, revenue, funding)\n- Try multiple search queries if the first doesn't work\n- You have ${companion.maxSteps - toolCallCount} steps remaining — use them\n\nWhen you have real data for most fields, THEN call submit_result.` },
        ];
        accumulatedText = "";
        continue;
      }

      // No submit_result call — check if we should continue
      if (round < MAX_CONTINUATIONS) {
        // If low effort, push to keep going AND submit
        if (effortRatio < MIN_EFFORT_RATIO && roundToolCalls > 0) {
          console.log(`[companion:worker] ${companion.name} stopped too early without submitting (${toolCallCount}/${companion.maxSteps} steps = ${Math.round(effortRatio * 100)}%). Injecting continuation...`);

          const resp = await result.response;
          const responseMessages = resp.messages;

          messages = [
            { role: "user" as const, content: userMessage },
            ...(responseMessages as CoreMessage[]),
            { role: "user" as const, content: `You stopped after only ${toolCallCount} tool calls out of ${companion.maxSteps} available, and you did NOT call submit_result.\n\nDo NOT write your findings as text. Continue researching, then call submit_result({ data: { ... } }) with your structured findings.\n\nRemember:\n- Visit actual pages, not just Google snippets\n- Search for each item's specific data points\n- Only call submit_result when you have real data` },
          ];
          accumulatedText = "";
          continue;
        }

        // If decent effort but forgot to submit, ask for submit_result call
        if (roundToolCalls > 0) {
          console.log(`[companion:worker] ${companion.name} finished work but forgot to call submit_result. Nudging...`);

          const resp = await result.response;
          const responseMessages = resp.messages;

          messages = [
            { role: "user" as const, content: userMessage },
            ...(responseMessages as CoreMessage[]),
            { role: "user" as const, content: "You did good research but forgot to call submit_result. Call submit_result({ data: { ... } }) now with your findings as structured data." },
          ];
          accumulatedText = "";
          continue;
        }
      }

      break;
    }

    console.log(`[companion:worker] ${companion.name} finished -- ${toolCallCount} tool call(s), ${accumulatedText.length} chars output`);
    console.log(`[companion:worker] ${companion.name} full output:\n${accumulatedText.substring(0, 2000)}`);

    // Prefer submit_result data, fall back to extracting JSON from text
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
      error: structured === null
        ? "Could not extract structured results — worker did not call submit_result"
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
