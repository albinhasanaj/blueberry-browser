import { streamText, stepCountIs } from "ai";
import { createBrowserTools, type BrowserToolDeps } from "../browserTools";
import { createModel, getModelName, getProvider } from "../modelProvider";
import { loadPromptWithVars } from "../prompts/loadPrompt";
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

export async function runWorker(params: {
  companion: CompanionDeclaration;
  task: string;
  context: unknown;
  deps: BrowserToolDeps;
  onEvent: (event: CompanionEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<CompanionRunResult> {
  const { companion, task, context, deps, onEvent, abortSignal } = params;

  const provider = getProvider();
  const modelName = getModelName(provider);
  const model = createModel(provider, modelName);

  if (!model) {
    return {
      companionId: companion.id,
      structuredOutput: null,
      rawText: "",
      messages: [],
      success: false,
      error: "LLM model not configured",
    };
  }

  // Build filtered tool set from browser tools
  const allTools = createBrowserTools(deps);
  const filteredTools: Record<string, (typeof allTools)[keyof typeof allTools]> = {};
  for (const toolName of companion.toolset) {
    if (toolName in allTools) {
      filteredTools[toolName] = allTools[toolName as keyof typeof allTools];
    }
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
    const result = streamText({
      model,
      system: companion.systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: filteredTools,
      stopWhen: stepCountIs(companion.maxSteps),
      temperature: companion.temperature,
      maxRetries: 2,
      abortSignal,
    });

    let accumulatedText = "";
    let thinkingText = "";
    let toolCallCount = 0;

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
        // Reset thinking text when switching to tool use
        thinkingText = "";
        toolCallCount++;
        console.log(`[companion:worker] ${companion.name} tool-call #${toolCallCount}: ${part.toolName}(${JSON.stringify((part as Record<string, unknown>).args ?? (part as Record<string, unknown>).input).substring(0, 300)})`);
        // Emit activity event so the UI shows what the worker is doing
        const args = (part as Record<string, unknown>).args ?? (part as Record<string, unknown>).input ?? {};
        let activity: string;
        switch (part.toolName) {
          case "navigate":
          case "open_tab": {
            const url = String((args as Record<string, unknown>).url ?? "");
            try { activity = `browsing ${new URL(url).hostname.replace("www.", "")}...`; } catch { activity = "browsing..."; }
            break;
          }
          case "read_page": activity = "reading page..."; break;
          case "find": activity = "searching page..."; break;
          case "click": activity = "clicking..."; break;
          case "type": activity = "typing..."; break;
          case "screenshot": activity = "taking screenshot..."; break;
          case "javascript": activity = "running script..."; break;
          case "extract": activity = "extracting data..."; break;
          default: activity = `using ${part.toolName}...`;
        }
        onEvent({
          type: "companion:activity",
          fromId: companion.id,
          fromName: companion.name,
          fromEmoji: companion.emoji,
          content: activity,
          activity,
          timestamp: Date.now(),
        });
      } else if (part.type === "tool-result") {
        const rawResult = (part as Record<string, unknown>).result ?? (part as Record<string, unknown>).output;
        const resultStr = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult);
        console.log(`[companion:worker] ${companion.name} tool-result #${toolCallCount}: ${resultStr.substring(0, 500)}`);
      }
    }

    console.log(`[companion:worker] ${companion.name} finished -- ${toolCallCount} tool call(s), ${accumulatedText.length} chars output`);
    console.log(`[companion:worker] ${companion.name} full output:\n${accumulatedText.substring(0, 2000)}`);

    const parsed = extractJSON(accumulatedText);

    return {
      companionId: companion.id,
      structuredOutput: parsed,
      rawText: accumulatedText,
      messages: [],
      success: parsed !== null,
      error: parsed === null ? "Could not parse structured JSON from response" : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[companion:worker] ${companion.name} error: ${errorMsg}`);
    if (errorMsg.includes("abort")) {
      return {
        companionId: companion.id,
        structuredOutput: null,
        rawText: "",
        messages: [],
        success: false,
        error: "Aborted",
      };
    }
    return {
      companionId: companion.id,
      structuredOutput: null,
      rawText: "",
      messages: [],
      success: false,
      error: errorMsg,
    };
  }
}
