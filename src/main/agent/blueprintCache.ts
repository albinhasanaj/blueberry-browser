import {
  queryBlueprints,
  upsertBlueprint,
  recordFailure as dbRecordFailure,
  pruneStale,
} from "./blueprintDb";
import { trace } from "./traceLogger";

const HIGH_CONFIDENCE = 0.8;

const GARBAGE_PATTERNS: RegExp[] = [
  /session|token|csrf|nonce/i,
  /[0-9a-f]{16,}/i,
  /[0-9]{6,}/,
  /:nth-child\(.*\).*:nth-child\(.*\).*:nth-child/,
  /\[data-reactid\]/,
  /\[data-v-[a-z0-9]+\]/,
];

let callCounter = 0;

export function isGarbageSelector(selector: string): boolean {
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(selector)) return true;
  }
  // Too deeply nested — more than 3 '>' combinators
  const combinators = selector.split(">").length - 1;
  if (combinators > 3) return true;

  return false;
}

function toSnakeCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 40);
}

export function inferIntent(
  selector: string,
  toolName: string,
  resultDescription: string,
): string {
  // Try aria-label extraction: aria-label='Search' or aria-label="Search"
  const ariaMatch = selector.match(/aria-label=['"](.*?)['"]/i);
  if (ariaMatch) {
    const label = toSnakeCase(ariaMatch[1]);
    if (toolName === "type") return label ? `${label}_input` : "text_input";
    if (toolName === "click") return label ? `${label}_button` : "button";
    return label || `${toolName}_element`;
  }

  // Try extracting from click result: 'Clicked <button> "Sign In"'
  const clickTextMatch = resultDescription.match(
    /Clicked\s+<(\w+)>\s*"([^"]+)"/,
  );
  if (clickTextMatch) {
    const tag = clickTextMatch[1];
    const text = toSnakeCase(clickTextMatch[2]);
    const suffix = tag === "a" ? "_link" : "_button";
    return text ? `${text}${suffix}` : `${toolName}${suffix}`;
  }

  // Try extracting from type result: 'Typed "..." into <input>'
  const typeMatch = resultDescription.match(/Typed\s+"[^"]*"\s+into\s+<(\w+)>/);
  if (typeMatch) {
    // Try to get a label from the selector itself
    const idMatch = selector.match(/#([a-zA-Z][\w-]*)/);
    if (idMatch) return `${toSnakeCase(idMatch[1])}_input`;
    const nameMatch = selector.match(/\[name=['"](.*?)['"]\]/);
    if (nameMatch) return `${toSnakeCase(nameMatch[1])}_input`;
    return "text_input";
  }

  // Fallback: tool + simplified selector
  const simplified = toSnakeCase(selector.replace(/[[\]'"=]/g, " ")).substring(
    0,
    20,
  );
  return `${toolName}_${simplified || "element"}`;
}

function detectSelectorType(selector: string): string {
  if (selector.startsWith("//") || selector.startsWith("(//")) return "xpath";
  if (/aria-label/i.test(selector)) return "aria";
  return "css";
}

export function learnFromToolCall(
  domain: string,
  selector: string,
  toolName: string,
  resultDescription: string,
): void {
  if (!selector || selector.includes("ref=")) return;
  if (isGarbageSelector(selector)) {
    trace("blueprint", "garbage_rejected", { domain, selector });
    return;
  }

  const intent = inferIntent(selector, toolName, resultDescription);
  const selectorType = detectSelectorType(selector);
  const description = resultDescription.substring(0, 120);

  try {
    upsertBlueprint(domain, intent, selector, selectorType, description);
    trace("blueprint", "upsert", { domain, intent, selector, selectorType });
  } catch (err) {
    console.error("[Blueprint] Failed to save blueprint:", err);
  }

  callCounter++;
  if (callCounter % 50 === 0) {
    try {
      pruneStale();
    } catch (err) {
      console.error("[Blueprint] Failed to prune stale entries:", err);
    }
  }
}

export function recordFailure(domain: string, selector: string): void {
  if (!selector || selector.includes("ref=")) return;
  try {
    dbRecordFailure(domain, selector);
    trace("blueprint", "db_failure_recorded", { domain, selector });
  } catch (err) {
    console.error("[Blueprint] Failed to record failure:", err);
  }
}

function daysAgo(isoDate: string): number {
  const diff = Date.now() - Date.parse(isoDate);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function formatBlueprintHints(domain: string): string {
  let rows;
  try {
    rows = queryBlueprints(domain);
  } catch {
    return "";
  }
  if (rows.length === 0) {
    console.log("[blueprint] domain:", domain, "| no hints yet");
    trace("blueprint", "hints_empty", { domain });
    return "";
  }

  const high = rows.filter((r) => r.confidence >= HIGH_CONFIDENCE).slice(0, 10);
  const mid = rows.filter((r) => r.confidence < HIGH_CONFIDENCE).slice(0, 5);

  const lines: string[] = [
    `\n## Known selectors for ${domain}`,
    "Use these selectors directly when they match your intent. Prefer them over re-discovering.",
  ];

  if (high.length > 0) {
    lines.push("High confidence:");
    for (const r of high) {
      const age = daysAgo(r.verified_at);
      lines.push(
        `- ${r.intent}: ${r.selector} (${r.selector_type}, verified ${age}d ago)`,
      );
    }
  }

  if (mid.length > 0) {
    lines.push("Mid confidence (verify before using):");
    for (const r of mid) {
      lines.push(
        `- ${r.intent}: ${r.selector} (${r.selector_type}, confidence: ${r.confidence.toFixed(2)})`,
      );
    }
  }

  const hints = lines.join("\n");
  console.log("[blueprint]", domain, hints || "no hints yet");
  trace("blueprint", "hints_formatted", { domain, hintCount: high.length + mid.length, highCount: high.length, midCount: mid.length, selectors: [...high, ...mid].map(r => r.selector) });
  return hints;
}
