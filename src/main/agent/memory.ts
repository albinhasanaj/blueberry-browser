import { app } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

/**
 * A single memory entry recording a successful interaction with a website.
 * Inspired by anthropic's memory system but simplified to JSON + domain-scoped entries.
 */
export interface MemoryEntry {
  /** The domain this experience applies to (e.g. "github.com") */
  domain: string;
  /** CSS selector that worked */
  selector: string;
  /** Which tool used it ("click", "type", "extract") */
  tool: string;
  /** Short description of what the selector targets */
  description: string;
  /** ISO timestamp of when this was recorded */
  timestamp: string;
  /** How many times this selector has been successfully reused */
  hitCount: number;
}

interface MemoryStore {
  version: 1;
  entries: MemoryEntry[];
}

const MAX_ENTRIES = 200;
const MAX_ENTRIES_PER_DOMAIN = 30;
const MEMORY_FILE = "agent-memory.json";

function getMemoryPath(): string {
  const dir = join(app.getPath("userData"), "agent");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, MEMORY_FILE);
}

export function loadMemory(): MemoryEntry[] {
  try {
    const raw = readFileSync(getMemoryPath(), "utf-8");
    const store: MemoryStore = JSON.parse(raw);
    if (store.version !== 1) return [];
    return store.entries;
  } catch {
    return [];
  }
}

function saveMemory(entries: MemoryEntry[]): void {
  const store: MemoryStore = { version: 1, entries };
  writeFileSync(getMemoryPath(), JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Record a successful selector interaction.
 * If an identical (domain + selector + tool) entry exists, bump its hitCount.
 * Otherwise append. Prunes to stay under limits.
 */
export function recordSuccess(
  domain: string,
  selector: string,
  tool: string,
  description: string,
): void {
  const entries = loadMemory();

  const existing = entries.find(
    (e) => e.domain === domain && e.selector === selector && e.tool === tool,
  );

  if (existing) {
    existing.hitCount++;
    existing.timestamp = new Date().toISOString();
    existing.description = description;
  } else {
    entries.push({
      domain,
      selector,
      tool,
      description,
      timestamp: new Date().toISOString(),
      hitCount: 1,
    });
  }

  saveMemory(prune(entries));
}

/**
 * Get memory entries relevant to a specific domain.
 * Returns entries sorted by hitCount (most reused first).
 */
export function getMemoryForDomain(domain: string): MemoryEntry[] {
  return loadMemory()
    .filter((e) => e.domain === domain)
    .sort((a, b) => b.hitCount - a.hitCount);
}

/**
 * Prune entries to stay under global and per-domain limits.
 * Evicts lowest-hitCount entries first, then oldest.
 */
function prune(entries: MemoryEntry[]): MemoryEntry[] {
  // Per-domain pruning
  const byDomain = new Map<string, MemoryEntry[]>();
  for (const e of entries) {
    const list = byDomain.get(e.domain) ?? [];
    list.push(e);
    byDomain.set(e.domain, list);
  }

  let result: MemoryEntry[] = [];
  for (const [, domainEntries] of byDomain) {
    // Sort: highest hitCount first, then newest first
    domainEntries.sort(
      (a, b) =>
        b.hitCount - a.hitCount ||
        Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
    result.push(...domainEntries.slice(0, MAX_ENTRIES_PER_DOMAIN));
  }

  // Global pruning
  if (result.length > MAX_ENTRIES) {
    result.sort(
      (a, b) =>
        b.hitCount - a.hitCount ||
        Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
    result = result.slice(0, MAX_ENTRIES);
  }

  return result;
}
