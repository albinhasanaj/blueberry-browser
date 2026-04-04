/**
 * Blueprint Cache Trace Analyzer
 * 
 * Reads NDJSON trace files produced by traceLogger.ts and runs
 * validation checks designed to EXPOSE PROBLEMS, not to pass.
 *
 * Usage:
 *   npx tsx tests/blueprint-validation/analyze-traces.ts <trace1.json> [trace2.json]
 *
 * Single file mode:  validates one run for correctness
 * Two file mode:     compares Run 1 vs Run 2 (same prompt) for improvement
 */

import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraceHeader {
  runId: string;
  prompt: string;
  startedAt: string;
  tracePath: string;
}

interface TraceEvent {
  ts: number;
  elapsed: number;
  category: string;
  event: string;
  data: Record<string, unknown>;
}

interface ParsedRun {
  header: TraceHeader;
  events: TraceEvent[];
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function parseTraceFile(path: string): ParsedRun {
  const raw = readFileSync(path, "utf-8").trim();
  const lines = raw.split("\n").map((l) => JSON.parse(l));
  const header = lines[0] as TraceHeader;
  const events = lines.slice(1) as TraceEvent[];
  return { header, events };
}

function findLatestTraces(dir: string, count: number): string[] {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("run-") && f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, count);
    return files.map((f) => join(dir, f));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function byCategory(events: TraceEvent[], cat: string): TraceEvent[] {
  return events.filter((e) => e.category === cat);
}

function byCatEvent(events: TraceEvent[], cat: string, evt: string): TraceEvent[] {
  return events.filter((e) => e.category === cat && e.event === evt);
}

function toolCalls(events: TraceEvent[]): TraceEvent[] {
  return byCatEvent(events, "tool", "call");
}

function toolResults(events: TraceEvent[]): TraceEvent[] {
  return byCatEvent(events, "tool", "result");
}

// ---------------------------------------------------------------------------
// Validation checks — single run
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "INFO";
  detail: string;
}

function checkNoFailedSelectorsLearned(events: TraceEvent[]): CheckResult {
  // If any blueprint.learn event happened for a selector that also had a 
  // find no_results event in the same run, that's a bug.
  const learnEvents = byCatEvent(events, "blueprint", "learn");
  const findNoResults = byCatEvent(events, "find", "no_results");

  const failedSelectors = new Set<string>();
  for (const e of findNoResults) {
    const q = e.data.query as Record<string, string> | undefined;
    if (q?.css) failedSelectors.add(q.css);
  }

  const poisoned: string[] = [];
  for (const e of learnEvents) {
    const sel = e.data.selector as string;
    if (failedSelectors.has(sel)) {
      poisoned.push(sel);
    }
  }

  if (poisoned.length > 0) {
    return {
      name: "no-failed-selectors-learned",
      status: "FAIL",
      detail: `POISONED CACHE: ${poisoned.length} failed selector(s) were learned: ${poisoned.join(", ")}`,
    };
  }
  return {
    name: "no-failed-selectors-learned",
    status: "PASS",
    detail: `No failed selectors leaked into the cache. ${learnEvents.length} selectors learned, ${findNoResults.length} find failures properly rejected.`,
  };
}

function checkFailuresRecorded(events: TraceEvent[]): CheckResult {
  const failEvents = byCatEvent(events, "blueprint", "failure_recorded");
  const dbFailEvents = byCatEvent(events, "blueprint", "db_failure_recorded");
  const detail = `${failEvents.length} failure(s) detected by LLMClient, ${dbFailEvents.length} recorded to DB.`;
  if (failEvents.length > 0 && dbFailEvents.length === 0) {
    return { name: "failures-recorded-to-db", status: "WARN", detail: detail + " Failures detected but NONE reached DB!" };
  }
  return { name: "failures-recorded-to-db", status: "INFO", detail };
}

function checkStaleRefsAfterNavigate(events: TraceEvent[]): CheckResult {
  // After a navigate.success, check if any subsequent tool call uses a ref
  // from before the navigation.
  const allCalls = toolCalls(events);
  const navEvents = byCatEvent(events, "navigate", "success");

  if (navEvents.length === 0) {
    return { name: "no-stale-refs-after-nav", status: "INFO", detail: "No navigation events found." };
  }

  // Track refs seen before each navigation
  const issues: string[] = [];
  let staleRefs = new Set<number>();  // refs from before the last nav
  let freshRefs = new Set<number>();  // refs discovered after the last nav
  let lastNavTs = 0;

  for (const e of events) {
    // Collect refs from find results
    if (e.category === "find" && e.event === "results") {
      const refs = e.data.refs as number[] | undefined;
      if (refs) refs.forEach((r) => freshRefs.add(r));
    }

    // On navigation, current fresh refs become stale
    if (e.category === "navigate" && e.event === "success") {
      staleRefs = new Set(freshRefs);
      freshRefs = new Set<number>();
      lastNavTs = e.ts;
    }

    // Check tool calls after navigation for stale ref usage
    if (e.category === "tool" && e.event === "call" && lastNavTs > 0 && e.ts > lastNavTs) {
      const input = e.data.input as Record<string, unknown> | undefined;
      const ref = input?.ref as number | undefined;
      if (ref != null && staleRefs.has(ref) && !freshRefs.has(ref)) {
        issues.push(`Tool ${e.data.toolName} used stale ref=${ref} at +${e.elapsed}ms (nav was at ts ${lastNavTs})`);
      }
    }
  }

  if (issues.length > 0) {
    return {
      name: "no-stale-refs-after-nav",
      status: "FAIL",
      detail: `STALE REF BUG: ${issues.length} stale ref usage(s) after navigation:\n  ${issues.join("\n  ")}`,
    };
  }
  return {
    name: "no-stale-refs-after-nav",
    status: "PASS",
    detail: "No stale ref usage detected after navigation events.",
  };
}

function checkRefInvalidationWarning(events: TraceEvent[]): CheckResult {
  // Every navigate.success should have a tool result containing the warning
  const navEvents = byCatEvent(events, "navigate", "success");
  const results = toolResults(events).filter((e) => e.data.toolName === "navigate");

  const missingWarning: string[] = [];
  for (const r of results) {
    const output = r.data.output as string;
    if (!output.includes("All previous refs are now invalid")) {
      missingWarning.push(`Navigate result at +${r.elapsed}ms missing ref invalidation warning`);
    }
  }

  if (missingWarning.length > 0) {
    return {
      name: "ref-invalidation-warning-present",
      status: "FAIL",
      detail: `${missingWarning.length} navigate result(s) missing ref invalidation warning:\n  ${missingWarning.join("\n  ")}`,
    };
  }
  if (navEvents.length === 0) {
    return { name: "ref-invalidation-warning-present", status: "INFO", detail: "No navigation events to check." };
  }
  return {
    name: "ref-invalidation-warning-present",
    status: "PASS",
    detail: `All ${results.length} navigate result(s) include ref invalidation warning.`,
  };
}

function checkDomainResolution(events: TraceEvent[]): CheckResult {
  const domainEvents = byCatEvent(events, "domain", "resolve");
  const promptBuild = byCatEvent(events, "system_prompt", "build");

  if (domainEvents.length === 0 && promptBuild.length === 0) {
    return { name: "domain-resolution", status: "WARN", detail: "No domain resolution events found." };
  }

  const issues: string[] = [];

  // Check if the system prompt used the right domain
  for (const e of promptBuild) {
    const domain = e.data.domain as string | null;
    const pageUrl = e.data.pageUrl as string | null;
    if (!domain && pageUrl) {
      issues.push(`System prompt built with URL ${pageUrl} but domain was null`);
    }
  }

  // Check if domain resolution used live URL
  for (const e of domainEvents) {
    const liveUrl = e.data.liveUrl as string | null;
    const cachedUrl = e.data.cachedUrl as string | null;
    if (!liveUrl && cachedUrl) {
      issues.push(`Domain resolved from cached URL (${cachedUrl}) instead of live webContents URL at +${e.elapsed}ms`);
    }
  }

  if (issues.length > 0) {
    return { name: "domain-resolution", status: "WARN", detail: issues.join("\n  ") };
  }
  return {
    name: "domain-resolution",
    status: "PASS",
    detail: `${domainEvents.length} domain resolution(s), all using live webContents URL.`,
  };
}

function checkGarbageRejection(events: TraceEvent[]): CheckResult {
  const rejected = byCatEvent(events, "blueprint", "garbage_rejected");
  return {
    name: "garbage-selector-rejection",
    status: "INFO",
    detail: `${rejected.length} garbage selector(s) rejected: ${rejected.map((e) => e.data.selector).join(", ") || "none"}`,
  };
}

function checkMidTaskHintInjection(events: TraceEvent[]): CheckResult {
  const injected = byCatEvent(events, "blueprint", "mid_task_inject");
  const noHints = byCatEvent(events, "blueprint", "mid_task_no_hints");
  const navEvents = byCatEvent(events, "navigate", "success");

  if (navEvents.length === 0) {
    return { name: "mid-task-hint-injection", status: "INFO", detail: "No navigations occurred." };
  }

  return {
    name: "mid-task-hint-injection",
    status: "INFO",
    detail: `${navEvents.length} navigation(s): ${injected.length} hint injection(s), ${noHints.length} with no hints available.${injected.map((e) => ` [${e.data.domain}]`).join("")}`,
  };
}

function checkHintsAtStart(events: TraceEvent[]): CheckResult {
  const hintLookup = byCatEvent(events, "system_prompt", "hint_lookup");

  if (hintLookup.length === 0) {
    return { name: "hints-at-start", status: "WARN", detail: "No hint lookup in system prompt build." };
  }

  const first = hintLookup[0];
  const had = first.data.hasBlueprint as boolean;
  const domain = first.data.domain as string;

  return {
    name: "hints-at-start",
    status: had ? "PASS" : "INFO",
    detail: had
      ? `Blueprint hints INJECTED at task start for ${domain}.`
      : `No blueprint hints available at task start for ${domain} (first visit or cache empty).`,
  };
}

function runSingleValidation(run: ParsedRun): CheckResult[] {
  const { events } = run;
  return [
    checkNoFailedSelectorsLearned(events),
    checkFailuresRecorded(events),
    checkStaleRefsAfterNavigate(events),
    checkRefInvalidationWarning(events),
    checkDomainResolution(events),
    checkGarbageRejection(events),
    checkMidTaskHintInjection(events),
    checkHintsAtStart(events),
  ];
}

// ---------------------------------------------------------------------------
// Comparison checks — Run 1 vs Run 2
// ---------------------------------------------------------------------------

interface CompareResult {
  name: string;
  status: "IMPROVED" | "SAME" | "REGRESSED" | "INFO";
  detail: string;
}

function compareRuns(run1: ParsedRun, run2: ParsedRun): CompareResult[] {
  const results: CompareResult[] = [];

  // 1. Step count comparison
  const steps1 = toolCalls(run1.events).length;
  const steps2 = toolCalls(run2.events).length;
  const stepDiff = steps1 - steps2;
  results.push({
    name: "step-count",
    status: stepDiff > 0 ? "IMPROVED" : stepDiff === 0 ? "SAME" : "REGRESSED",
    detail: `Run 1: ${steps1} tool calls, Run 2: ${steps2} tool calls (${stepDiff > 0 ? "-" : "+"}${Math.abs(stepDiff)} calls${stepDiff > 0 ? " = FASTER" : stepDiff < 0 ? " = SLOWER" : ""})`,
  });

  // 2. Duration comparison
  const dur1 = run1.events.at(-1)?.elapsed ?? 0;
  const dur2 = run2.events.at(-1)?.elapsed ?? 0;
  results.push({
    name: "duration",
    status: dur1 > dur2 ? "IMPROVED" : dur1 === dur2 ? "SAME" : "REGRESSED",
    detail: `Run 1: ${(dur1 / 1000).toFixed(1)}s, Run 2: ${(dur2 / 1000).toFixed(1)}s`,
  });

  // 3. Blueprint hints at start — Run 2 should have them if Run 1 learned anything
  const run1Learns = byCatEvent(run1.events, "blueprint", "learn").length;
  const run2HintsAtStart = byCatEvent(run2.events, "system_prompt", "hint_lookup")
    .filter((e) => e.data.hasBlueprint === true);
  const run2MidInject = byCatEvent(run2.events, "blueprint", "mid_task_inject");

  if (run1Learns > 0 && run2HintsAtStart.length === 0 && run2MidInject.length === 0) {
    results.push({
      name: "hints-available-on-repeat",
      status: "REGRESSED",
      detail: `Run 1 learned ${run1Learns} selector(s) but Run 2 had NO hints at start and NO mid-task injection. Cache not working!`,
    });
  } else if (run2HintsAtStart.length > 0 || run2MidInject.length > 0) {
    results.push({
      name: "hints-available-on-repeat",
      status: "IMPROVED",
      detail: `Run 2 had ${run2HintsAtStart.length} hint(s) at start + ${run2MidInject.length} mid-task injection(s). Blueprint cache is serving knowledge.`,
    });
  } else {
    results.push({
      name: "hints-available-on-repeat",
      status: "SAME",
      detail: `Run 1 learned ${run1Learns} selectors. No hints in Run 2 (may be different domain or cache empty).`,
    });
  }

  // 4. read_page call count comparison
  const rp1 = toolCalls(run1.events).filter((e) => e.data.toolName === "read_page").length;
  const rp2 = toolCalls(run2.events).filter((e) => e.data.toolName === "read_page").length;
  results.push({
    name: "read-page-calls",
    status: rp2 < rp1 ? "IMPROVED" : rp2 === rp1 ? "SAME" : "REGRESSED",
    detail: `Run 1: ${rp1} read_page calls, Run 2: ${rp2} read_page calls${rp2 < rp1 ? " (agent skipping scans thanks to hints!)" : ""}`,
  });

  // 5. find() call count comparison
  const f1 = toolCalls(run1.events).filter((e) => e.data.toolName === "find").length;
  const f2 = toolCalls(run2.events).filter((e) => e.data.toolName === "find").length;
  results.push({
    name: "find-calls",
    status: f2 < f1 ? "IMPROVED" : f2 === f1 ? "SAME" : "REGRESSED",
    detail: `Run 1: ${f1} find calls, Run 2: ${f2} find calls`,
  });

  // 6. Did Run 2 use blueprint selectors directly?
  const run2Calls = toolCalls(run2.events);
  const selectorUsed = run2Calls.filter((e) => {
    const input = e.data.input as Record<string, unknown>;
    return input?.selector != null;
  });
  results.push({
    name: "selector-direct-usage",
    status: selectorUsed.length > 0 ? "IMPROVED" : "SAME",
    detail: `Run 2 used direct selectors in ${selectorUsed.length} tool call(s): ${selectorUsed.map((e) => `${e.data.toolName}(${(e.data.input as Record<string, unknown>).selector})`).join(", ") || "none"}`,
  });

  // 7. Error/retry comparison
  const errors1 = toolResults(run1.events).filter((e) => {
    const out = e.data.output as string;
    return out?.startsWith("Error") || out?.includes("No elements found");
  }).length;
  const errors2 = toolResults(run2.events).filter((e) => {
    const out = e.data.output as string;
    return out?.startsWith("Error") || out?.includes("No elements found");
  }).length;
  results.push({
    name: "error-count",
    status: errors2 < errors1 ? "IMPROVED" : errors2 === errors1 ? "SAME" : "REGRESSED",
    detail: `Run 1: ${errors1} errors/failures, Run 2: ${errors2} errors/failures`,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Tool call timeline for manual inspection
// ---------------------------------------------------------------------------

function printTimeline(run: ParsedRun, label: string): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label}: ${run.header.prompt}`);
  console.log(`  Run ID: ${run.header.runId}`);
  console.log(`  Started: ${run.header.startedAt}`);
  console.log(`${"═".repeat(70)}`);

  const calls = toolCalls(run.events);
  const results = toolResults(run.events);
  const bpEvents = byCategory(run.events, "blueprint");
  const navEvents = [...byCatEvent(run.events, "navigate", "success"), ...byCatEvent(run.events, "open_tab", "success")];
  const findEvents = byCategory(run.events, "find");

  console.log(`\n  Tool calls: ${calls.length}`);
  console.log(`  Navigations: ${navEvents.length}`);
  console.log(`  Blueprint events: ${bpEvents.length}`);
  console.log(`  Find events: ${findEvents.length}`);

  console.log(`\n  ── Tool Call Timeline ──`);
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const input = c.data.input as Record<string, unknown>;
    const inputStr = Object.entries(input)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v.substring(0, 50)}"` : v}`)
      .join(", ");

    // Find matching result
    const matchResult = results.find(
      (r) => r.data.toolName === c.data.toolName && r.ts >= c.ts,
    );
    const output = matchResult
      ? (matchResult.data.output as string)?.substring(0, 80) ?? ""
      : "?";

    const hasRef = input.ref != null;
    const hasSel = input.selector != null;
    const flag = hasRef ? " [ref]" : hasSel ? " [selector]" : "";

    console.log(
      `  ${String(i + 1).padStart(3)}. +${(c.elapsed / 1000).toFixed(1)}s  ${c.data.toolName}(${inputStr})${flag}`,
    );
    console.log(`       → ${output}`);
  }

  // Blueprint events
  if (bpEvents.length > 0) {
    console.log(`\n  ── Blueprint Events ──`);
    for (const e of bpEvents) {
      const d = e.data;
      switch (e.event) {
        case "learn":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  LEARN: ${d.selector} (${d.toolName}) on ${d.domain}`);
          break;
        case "upsert":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  UPSERT: intent="${d.intent}" selector=${d.selector}`);
          break;
        case "failure_recorded":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  FAIL: ${d.selector} on ${d.domain} — ${(d.reason as string)?.substring(0, 60)}`);
          break;
        case "db_failure_recorded":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  DB_FAIL: ${d.selector} on ${d.domain}`);
          break;
        case "garbage_rejected":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  GARBAGE: ${d.selector} rejected`);
          break;
        case "hints_formatted":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  HINTS: ${d.domain} — ${d.hintCount} hints (${d.highCount} high, ${d.midCount} mid)`);
          break;
        case "hints_empty":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  HINTS: ${d.domain} — empty`);
          break;
        case "mid_task_inject":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  MID-INJECT: ${d.domain} (${d.hintsLength} chars)`);
          break;
        case "mid_task_no_hints":
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  MID-INJECT: ${d.domain} — no hints available`);
          break;
        default:
          console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  ${e.event}: ${JSON.stringify(d)}`);
      }
    }
  }

  // Domain resolution
  const domainEvents = byCatEvent(run.events, "domain", "resolve");
  if (domainEvents.length > 0) {
    console.log(`\n  ── Domain Resolutions ──`);
    for (const e of domainEvents) {
      console.log(`  +${(e.elapsed / 1000).toFixed(1)}s  live=${e.data.liveUrl ?? "null"} cached=${e.data.cachedUrl ?? "null"} → ${e.data.resolved}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printChecks(checks: CheckResult[], label: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  VALIDATION: ${label}`);
  console.log(`${"─".repeat(60)}`);

  const icons = { PASS: "✅", FAIL: "❌", WARN: "⚠️ ", INFO: "ℹ️ " };
  for (const c of checks) {
    console.log(`  ${icons[c.status]} ${c.name}: ${c.detail}`);
  }

  const fails = checks.filter((c) => c.status === "FAIL");
  const warns = checks.filter((c) => c.status === "WARN");
  console.log(`\n  Summary: ${checks.length} checks — ${fails.length} FAIL, ${warns.length} WARN`);
  if (fails.length > 0) {
    console.log("  ❌ BUGS DETECTED — see FAIL items above");
  }
}

function printComparison(comparisons: CompareResult[]): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log("  COMPARISON: Run 1 vs Run 2");
  console.log(`${"─".repeat(60)}`);

  const icons = { IMPROVED: "🟢", SAME: "⚪", REGRESSED: "🔴", INFO: "ℹ️ " };
  for (const c of comparisons) {
    console.log(`  ${icons[c.status]} ${c.name}: ${c.detail}`);
  }

  const improved = comparisons.filter((c) => c.status === "IMPROVED").length;
  const regressed = comparisons.filter((c) => c.status === "REGRESSED").length;
  console.log(`\n  Summary: ${improved} improved, ${regressed} regressed, ${comparisons.length - improved - regressed} same/info`);

  if (regressed > 0) {
    console.log("  🔴 REGRESSIONS DETECTED");
  } else if (improved > 0) {
    console.log("  🟢 Blueprint cache is providing improvement!");
  } else {
    console.log("  ⚪ No difference detected (may need more runs or different task)");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  let paths: string[] = [];

  if (args.length === 0) {
    // Auto-find latest traces in common locations
    const possibleDirs = [
      join(process.env.APPDATA || "", "blueberry-browser", "traces"),
      join(process.env.LOCALAPPDATA || "", "blueberry-browser", "traces"),
    ];

    for (const dir of possibleDirs) {
      const found = findLatestTraces(dir, 2);
      if (found.length > 0) {
        paths = found;
        console.log(`Auto-found traces in ${dir}`);
        break;
      }
    }

    if (paths.length === 0) {
      console.error("No trace files found. Pass paths as arguments or run the app first.");
      console.error("Usage: npx tsx tests/blueprint-validation/analyze-traces.ts <trace1.json> [trace2.json]");
      process.exit(1);
    }
  } else {
    paths = args;
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         BLUEPRINT CACHE TRACE ANALYZER                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const runs = paths.map((p) => {
    console.log(`  Loading: ${basename(p)}`);
    return parseTraceFile(p);
  });

  // Print timelines
  runs.forEach((run, i) => printTimeline(run, `Run ${i + 1}`));

  // Validate each run
  runs.forEach((run, i) => {
    const checks = runSingleValidation(run);
    printChecks(checks, `Run ${i + 1} (${run.header.runId})`);
  });

  // Compare if we have two runs
  if (runs.length >= 2) {
    const comparisons = compareRuns(runs[1], runs[0]); // [1] is older, [0] is newer (sorted desc)
    // Actually, if passed as args, args[0] is run1, args[1] is run2
    const comp = args.length >= 2
      ? compareRuns(runs[0], runs[1])
      : compareRuns(runs[1], runs[0]); // auto-found are sorted desc, so reverse
    printComparison(comp);
  }

  // Final pass/fail exit code
  const allChecks = runs.flatMap((r) => runSingleValidation(r));
  const hasFails = allChecks.some((c) => c.status === "FAIL");
  process.exit(hasFails ? 1 : 0);
}

main();
