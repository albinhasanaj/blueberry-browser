import { app } from "electron";
import { join } from "path";
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "fs";

export interface TraceEvent {
  ts: number;
  elapsed: number;
  category: string;
  event: string;
  data: Record<string, unknown>;
}

let traceFile: string | null = null;
let runStart = 0;
let eventCount = 0;
let currentRunId: string | null = null;

function getTracesDir(): string {
  const dir = join(app.getPath("userData"), "traces");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function startTraceRun(prompt: string): string {
  const now = Date.now();
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  currentRunId = `run-${stamp}`;
  traceFile = join(getTracesDir(), `${currentRunId}.json`);
  runStart = now;
  eventCount = 0;

  // Write header
  const header = {
    runId: currentRunId,
    prompt,
    startedAt: new Date(now).toISOString(),
    tracePath: traceFile,
  };
  writeFileSync(traceFile, JSON.stringify(header) + "\n", "utf-8");
  console.log(`[trace] Run started -> ${traceFile}`);
  return currentRunId;
}

export function trace(
  category: string,
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (!traceFile) return;

  const now = Date.now();
  const entry: TraceEvent = {
    ts: now,
    elapsed: now - runStart,
    category,
    event,
    data,
  };
  eventCount++;

  try {
    appendFileSync(traceFile, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.error("[trace] Failed to write trace event:", err);
  }
}

export function endTraceRun(summary: Record<string, unknown> = {}): void {
  if (!traceFile) return;

  const now = Date.now();
  const footer = {
    ts: now,
    elapsed: now - runStart,
    category: "run",
    event: "end",
    data: {
      totalEvents: eventCount,
      durationMs: now - runStart,
      ...summary,
    },
  };

  try {
    appendFileSync(traceFile, JSON.stringify(footer) + "\n", "utf-8");
    console.log(
      `[trace] Run ended -> ${eventCount} events in ${now - runStart}ms -> ${traceFile}`,
    );
  } catch (err) {
    console.error("[trace] Failed to write trace footer:", err);
  }

  traceFile = null;
  currentRunId = null;
}

export function getTracePath(): string | null {
  return traceFile;
}

export function getRunId(): string | null {
  return currentRunId;
}
