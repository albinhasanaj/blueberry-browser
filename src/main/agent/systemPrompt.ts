import { MAX_CONTEXT_LENGTH } from "./types";
import { type MemoryEntry, getMemoryForDomain } from "./memory";
import { formatBlueprintHints } from "./blueprintCache";
import { trace } from "./traceLogger";
import { loadPrompt, loadPromptWithVars } from "./prompts/loadPrompt";

export function buildSystemPrompt(
  url: string | null,
  pageText: string | null,
): string {
  const parts: string[] = [
    loadPrompt("agent/system"),
  ];

  // Inject domain-scoped memory if we have a URL
  if (url) {
    const domain = extractDomain(url);
    if (domain) {
      const blueprintHints = formatBlueprintHints(domain);
      const legacyMemory = getMemoryForDomain(domain);
      trace("system_prompt", "hint_lookup", { domain, hasBlueprint: !!blueprintHints, legacyCount: legacyMemory.length });
      if (blueprintHints) {
        parts.push(blueprintHints);
        parts.push("\n" + loadPrompt("agent/blueprint-usage"));
      } else if (legacyMemory.length > 0) {
        parts.push(formatMemorySection(legacyMemory, domain));
      }
    }
  }

  if (url) {
    parts.push(`\nCurrent page URL: ${url}`);
  }

  if (pageText) {
    const truncated = truncateText(pageText, MAX_CONTEXT_LENGTH);
    parts.push(`\nPage content (text):\n${truncated}`);
  }

  return parts.join("\n");
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function formatMemorySection(memories: MemoryEntry[], domain: string): string {
  const lines = memories.map(
    (m) =>
      `- \`${m.selector}\` (${m.tool}) -- ${m.description} [used ${m.hitCount}x]`,
  );
  return (
    "\n" + loadPromptWithVars("agent/memory-section", { domain }) + "\n" +
    lines.join("\n")
  );
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
