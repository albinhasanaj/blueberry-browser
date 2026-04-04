/**
 * Generate synthetic trace files to validate the analyzer works correctly.
 * Creates two traces: a "cold" run and a "warm" run, then runs the analyzer.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const outDir = join(__dirname, "synthetic-traces");
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Run 1: Cold cache — first visit to youtube
// ---------------------------------------------------------------------------
const run1Lines: string[] = [];
const run1Start = Date.now() - 60000; // 1 min ago
let ts = run1Start;

function t(offset: number): number {
  ts = run1Start + offset;
  return ts;
}

// Header
run1Lines.push(JSON.stringify({
  runId: "run-2026-04-04T14-00-00-000Z",
  prompt: "go to youtube, search for funny cats, and open the first video",
  startedAt: new Date(run1Start).toISOString(),
  tracePath: "synthetic/run1.json",
}));

// Run start
run1Lines.push(JSON.stringify({ ts: t(0), elapsed: 0, category: "run", event: "start", data: { prompt: "go to youtube, search for funny cats, and open the first video" } }));

// System prompt build — starts on google.com
run1Lines.push(JSON.stringify({ ts: t(100), elapsed: 100, category: "system_prompt", event: "build", data: { domain: "www.google.com", pageUrl: "https://www.google.com", hasPageText: true, pageTextLength: 5000 } }));
run1Lines.push(JSON.stringify({ ts: t(101), elapsed: 101, category: "system_prompt", event: "hint_lookup", data: { domain: "www.google.com", hasBlueprint: false, legacyCount: 0 } }));

// Tool call 1: navigate to youtube
run1Lines.push(JSON.stringify({ ts: t(500), elapsed: 500, category: "tool", event: "call", data: { toolName: "navigate", input: { url: "https://www.youtube.com" } } }));
run1Lines.push(JSON.stringify({ ts: t(3000), elapsed: 3000, category: "navigate", event: "success", data: { url: "https://www.youtube.com", finalUrl: "https://www.youtube.com/", title: "YouTube" } }));
run1Lines.push(JSON.stringify({ ts: t(3001), elapsed: 3001, category: "domain", event: "resolve", data: { liveUrl: "https://www.youtube.com/", cachedUrl: "https://www.youtube.com/", resolved: "www.youtube.com" } }));
run1Lines.push(JSON.stringify({ ts: t(3002), elapsed: 3002, category: "tool", event: "result", data: { toolName: "navigate", input: { url: "https://www.youtube.com" }, output: "Navigated to https://www.youtube.com/ -- page title: \"YouTube\"\n⚠ All previous refs are now invalid. Use find() or read_page() to get fresh refs before clicking or typing." } }));
run1Lines.push(JSON.stringify({ ts: t(3003), elapsed: 3003, category: "blueprint", event: "mid_task_no_hints", data: { domain: "www.youtube.com" } }));

// Tool call 2: read_page
run1Lines.push(JSON.stringify({ ts: t(3500), elapsed: 3500, category: "tool", event: "call", data: { toolName: "read_page", input: {} } }));
run1Lines.push(JSON.stringify({ ts: t(4000), elapsed: 4000, category: "tool", event: "result", data: { toolName: "read_page", input: {}, output: "[ref=1] <input placeholder=\"Search\"> [ref=2] <button \"Sign in\"> [ref=3] <a \"Trending\">..." } }));

// Tool call 3: find search box (by CSS — this one will fail with "No elements found")
run1Lines.push(JSON.stringify({ ts: t(4500), elapsed: 4500, category: "tool", event: "call", data: { toolName: "find", input: { css: "input#search" } } }));
run1Lines.push(JSON.stringify({ ts: t(5000), elapsed: 5000, category: "find", event: "no_results", data: { query: { css: "input#search" } } }));
run1Lines.push(JSON.stringify({ ts: t(5001), elapsed: 5001, category: "tool", event: "result", data: { toolName: "find", input: { css: "input#search" }, output: "No elements found matching the query." } }));
// Blueprint should record failure, not learn
run1Lines.push(JSON.stringify({ ts: t(5002), elapsed: 5002, category: "domain", event: "resolve", data: { liveUrl: "https://www.youtube.com/", cachedUrl: "https://www.youtube.com/", resolved: "www.youtube.com" } }));
run1Lines.push(JSON.stringify({ ts: t(5003), elapsed: 5003, category: "blueprint", event: "failure_recorded", data: { domain: "www.youtube.com", selector: "input#search", toolName: "find", reason: "No elements found matching the query." } }));
run1Lines.push(JSON.stringify({ ts: t(5004), elapsed: 5004, category: "blueprint", event: "db_failure_recorded", data: { domain: "www.youtube.com", selector: "input#search" } }));

// Tool call 4: find search box (by placeholder — this one works)
run1Lines.push(JSON.stringify({ ts: t(5500), elapsed: 5500, category: "tool", event: "call", data: { toolName: "find", input: { css: "input[placeholder='Search']" } } }));
run1Lines.push(JSON.stringify({ ts: t(6000), elapsed: 6000, category: "find", event: "results", data: { query: { css: "input[placeholder='Search']" }, count: 1, refs: [1] } }));
run1Lines.push(JSON.stringify({ ts: t(6001), elapsed: 6001, category: "tool", event: "result", data: { toolName: "find", input: { css: "input[placeholder='Search']" }, output: "Found 1 element(s):\n[ref=1] <input placeholder=\"Search\">" } }));
// Blueprint learns this one
run1Lines.push(JSON.stringify({ ts: t(6002), elapsed: 6002, category: "domain", event: "resolve", data: { liveUrl: "https://www.youtube.com/", cachedUrl: "https://www.youtube.com/", resolved: "www.youtube.com" } }));
run1Lines.push(JSON.stringify({ ts: t(6003), elapsed: 6003, category: "blueprint", event: "learn", data: { domain: "www.youtube.com", selector: "input[placeholder='Search']", toolName: "find" } }));
run1Lines.push(JSON.stringify({ ts: t(6004), elapsed: 6004, category: "blueprint", event: "upsert", data: { domain: "www.youtube.com", intent: "search_input", selector: "input[placeholder='Search']", selectorType: "css" } }));

// Tool call 5: type into search
run1Lines.push(JSON.stringify({ ts: t(6500), elapsed: 6500, category: "tool", event: "call", data: { toolName: "type", input: { ref: 1, text: "funny cats" } } }));
run1Lines.push(JSON.stringify({ ts: t(7000), elapsed: 7000, category: "tool", event: "result", data: { toolName: "type", input: { ref: 1, text: "funny cats" }, output: "Typed \"funny cats\" into <input>" } }));

// Tool call 6: press Enter
run1Lines.push(JSON.stringify({ ts: t(7500), elapsed: 7500, category: "tool", event: "call", data: { toolName: "press_key", input: { key: "Enter" } } }));
run1Lines.push(JSON.stringify({ ts: t(8000), elapsed: 8000, category: "tool", event: "result", data: { toolName: "press_key", input: { key: "Enter" }, output: "Pressed \"Enter\" key" } }));

// Tool call 7: read_page again (after search results load)
run1Lines.push(JSON.stringify({ ts: t(9000), elapsed: 9000, category: "tool", event: "call", data: { toolName: "read_page", input: {} } }));
run1Lines.push(JSON.stringify({ ts: t(9500), elapsed: 9500, category: "tool", event: "result", data: { toolName: "read_page", input: {}, output: "[ref=10] <a \"funny cats compilation\"> [ref=11] <a \"funny cats 2024\">..." } }));

// Tool call 8: click first video
run1Lines.push(JSON.stringify({ ts: t(10000), elapsed: 10000, category: "tool", event: "call", data: { toolName: "click", input: { ref: 10 } } }));
run1Lines.push(JSON.stringify({ ts: t(10500), elapsed: 10500, category: "tool", event: "result", data: { toolName: "click", input: { ref: 10 }, output: "Clicked <a> \"funny cats compilation\"" } }));

// Run end
run1Lines.push(JSON.stringify({ ts: t(12000), elapsed: 12000, category: "run", event: "end", data: { totalEvents: 25, durationMs: 12000 } }));

// ---------------------------------------------------------------------------
// Run 2: Warm cache — repeat visit, should be faster
// ---------------------------------------------------------------------------
const run2Lines: string[] = [];
const run2Start = Date.now() - 30000;
let ts2 = run2Start;

function t2(offset: number): number {
  ts2 = run2Start + offset;
  return ts2;
}

run2Lines.push(JSON.stringify({
  runId: "run-2026-04-04T14-01-00-000Z",
  prompt: "go to youtube, search for funny cats, and open the first video",
  startedAt: new Date(run2Start).toISOString(),
  tracePath: "synthetic/run2.json",
}));

run2Lines.push(JSON.stringify({ ts: t2(0), elapsed: 0, category: "run", event: "start", data: { prompt: "go to youtube, search for funny cats, and open the first video" } }));

// System prompt — still on google.com at start
run2Lines.push(JSON.stringify({ ts: t2(100), elapsed: 100, category: "system_prompt", event: "build", data: { domain: "www.google.com", pageUrl: "https://www.google.com", hasPageText: true, pageTextLength: 5000 } }));
run2Lines.push(JSON.stringify({ ts: t2(101), elapsed: 101, category: "system_prompt", event: "hint_lookup", data: { domain: "www.google.com", hasBlueprint: false, legacyCount: 0 } }));

// Tool call 1: navigate to youtube
run2Lines.push(JSON.stringify({ ts: t2(500), elapsed: 500, category: "tool", event: "call", data: { toolName: "navigate", input: { url: "https://www.youtube.com" } } }));
run2Lines.push(JSON.stringify({ ts: t2(3000), elapsed: 3000, category: "navigate", event: "success", data: { url: "https://www.youtube.com", finalUrl: "https://www.youtube.com/", title: "YouTube" } }));
run2Lines.push(JSON.stringify({ ts: t2(3001), elapsed: 3001, category: "domain", event: "resolve", data: { liveUrl: "https://www.youtube.com/", cachedUrl: "https://www.youtube.com/", resolved: "www.youtube.com" } }));
run2Lines.push(JSON.stringify({ ts: t2(3002), elapsed: 3002, category: "tool", event: "result", data: { toolName: "navigate", input: { url: "https://www.youtube.com" }, output: "Navigated to https://www.youtube.com/ -- page title: \"YouTube\"\n⚠ All previous refs are now invalid. Use find() or read_page() to get fresh refs before clicking or typing." } }));
// MID-TASK INJECTION — cache has hints now!
run2Lines.push(JSON.stringify({ ts: t2(3003), elapsed: 3003, category: "blueprint", event: "hints_formatted", data: { domain: "www.youtube.com", hintCount: 1, highCount: 1, midCount: 0, selectors: ["input[placeholder='Search']"] } }));
run2Lines.push(JSON.stringify({ ts: t2(3004), elapsed: 3004, category: "blueprint", event: "mid_task_inject", data: { domain: "www.youtube.com", hintsLength: 150 } }));

// Tool call 2: type directly using selector from cache (skips read_page AND find!)
run2Lines.push(JSON.stringify({ ts: t2(3500), elapsed: 3500, category: "tool", event: "call", data: { toolName: "type", input: { selector: "input[placeholder='Search']", text: "funny cats" } } }));
run2Lines.push(JSON.stringify({ ts: t2(4000), elapsed: 4000, category: "tool", event: "result", data: { toolName: "type", input: { selector: "input[placeholder='Search']", text: "funny cats" }, output: "Typed \"funny cats\" into <input>" } }));
run2Lines.push(JSON.stringify({ ts: t2(4001), elapsed: 4001, category: "domain", event: "resolve", data: { liveUrl: "https://www.youtube.com/", cachedUrl: "https://www.youtube.com/", resolved: "www.youtube.com" } }));
run2Lines.push(JSON.stringify({ ts: t2(4002), elapsed: 4002, category: "blueprint", event: "learn", data: { domain: "www.youtube.com", selector: "input[placeholder='Search']", toolName: "type" } }));
run2Lines.push(JSON.stringify({ ts: t2(4003), elapsed: 4003, category: "blueprint", event: "upsert", data: { domain: "www.youtube.com", intent: "search_input", selector: "input[placeholder='Search']", selectorType: "css" } }));

// Tool call 3: press Enter
run2Lines.push(JSON.stringify({ ts: t2(4500), elapsed: 4500, category: "tool", event: "call", data: { toolName: "press_key", input: { key: "Enter" } } }));
run2Lines.push(JSON.stringify({ ts: t2(5000), elapsed: 5000, category: "tool", event: "result", data: { toolName: "press_key", input: { key: "Enter" }, output: "Pressed \"Enter\" key" } }));

// Tool call 4: read_page to find videos
run2Lines.push(JSON.stringify({ ts: t2(6000), elapsed: 6000, category: "tool", event: "call", data: { toolName: "read_page", input: {} } }));
run2Lines.push(JSON.stringify({ ts: t2(6500), elapsed: 6500, category: "tool", event: "result", data: { toolName: "read_page", input: {}, output: "[ref=10] <a \"funny cats compilation\"> [ref=11] <a \"funny cats 2024\">..." } }));

// Tool call 5: click first video
run2Lines.push(JSON.stringify({ ts: t2(7000), elapsed: 7000, category: "tool", event: "call", data: { toolName: "click", input: { ref: 10 } } }));
run2Lines.push(JSON.stringify({ ts: t2(7500), elapsed: 7500, category: "tool", event: "result", data: { toolName: "click", input: { ref: 10 }, output: "Clicked <a> \"funny cats compilation\"" } }));

// Run end
run2Lines.push(JSON.stringify({ ts: t2(9000), elapsed: 9000, category: "run", event: "end", data: { totalEvents: 18, durationMs: 9000 } }));

// ---------------------------------------------------------------------------
// Run 3: BUGGY run — simulates what happens if our fixes DON'T work
// This should produce FAILs in the analyzer
// ---------------------------------------------------------------------------
const run3Lines: string[] = [];
const run3Start = Date.now() - 15000;
let ts3 = run3Start;

function t3(offset: number): number {
  ts3 = run3Start + offset;
  return ts3;
}

run3Lines.push(JSON.stringify({
  runId: "run-2026-04-04T14-02-00-000Z-buggy",
  prompt: "go to youtube, search for funny cats, and open the first video",
  startedAt: new Date(run3Start).toISOString(),
  tracePath: "synthetic/run3-buggy.json",
}));

run3Lines.push(JSON.stringify({ ts: t3(0), elapsed: 0, category: "run", event: "start", data: { prompt: "go to youtube..." } }));
run3Lines.push(JSON.stringify({ ts: t3(100), elapsed: 100, category: "system_prompt", event: "build", data: { domain: "www.google.com", pageUrl: "https://www.google.com", hasPageText: true, pageTextLength: 5000 } }));
run3Lines.push(JSON.stringify({ ts: t3(101), elapsed: 101, category: "system_prompt", event: "hint_lookup", data: { domain: "www.google.com", hasBlueprint: false, legacyCount: 0 } }));

// Navigate
run3Lines.push(JSON.stringify({ ts: t3(500), elapsed: 500, category: "tool", event: "call", data: { toolName: "navigate", input: { url: "https://www.youtube.com" } } }));
run3Lines.push(JSON.stringify({ ts: t3(3000), elapsed: 3000, category: "navigate", event: "success", data: { url: "https://www.youtube.com", finalUrl: "https://www.youtube.com/", title: "YouTube" } }));
// BUG: navigate result MISSING the warning
run3Lines.push(JSON.stringify({ ts: t3(3002), elapsed: 3002, category: "tool", event: "result", data: { toolName: "navigate", input: { url: "https://www.youtube.com" }, output: "Navigated to https://www.youtube.com/ -- page title: \"YouTube\"" } }));

// read_page — gets refs
run3Lines.push(JSON.stringify({ ts: t3(3500), elapsed: 3500, category: "tool", event: "call", data: { toolName: "read_page", input: {} } }));
run3Lines.push(JSON.stringify({ ts: t3(4000), elapsed: 4000, category: "find", event: "results", data: { query: {}, count: 3, refs: [1, 2, 3] } }));
run3Lines.push(JSON.stringify({ ts: t3(4001), elapsed: 4001, category: "tool", event: "result", data: { toolName: "read_page", input: {}, output: "[ref=1] <input> [ref=2] <button> [ref=3] <a>" } }));

// find with bad selector — but BUG: it gets LEARNED anyway
run3Lines.push(JSON.stringify({ ts: t3(4500), elapsed: 4500, category: "tool", event: "call", data: { toolName: "find", input: { css: "input#search" } } }));
run3Lines.push(JSON.stringify({ ts: t3(5000), elapsed: 5000, category: "find", event: "no_results", data: { query: { css: "input#search" } } }));
run3Lines.push(JSON.stringify({ ts: t3(5001), elapsed: 5001, category: "tool", event: "result", data: { toolName: "find", input: { css: "input#search" }, output: "No elements found matching the query." } }));
// BUG: learning from failed selector
run3Lines.push(JSON.stringify({ ts: t3(5002), elapsed: 5002, category: "blueprint", event: "learn", data: { domain: "www.youtube.com", selector: "input#search", toolName: "find" } }));

// type into ref=1
run3Lines.push(JSON.stringify({ ts: t3(5500), elapsed: 5500, category: "tool", event: "call", data: { toolName: "type", input: { ref: 1, text: "funny cats" } } }));
run3Lines.push(JSON.stringify({ ts: t3(6000), elapsed: 6000, category: "tool", event: "result", data: { toolName: "type", input: { ref: 1, text: "funny cats" }, output: "Typed \"funny cats\" into <input>" } }));

// press Enter (causes page navigation)
run3Lines.push(JSON.stringify({ ts: t3(6500), elapsed: 6500, category: "tool", event: "call", data: { toolName: "press_key", input: { key: "Enter" } } }));
run3Lines.push(JSON.stringify({ ts: t3(7000), elapsed: 7000, category: "tool", event: "result", data: { toolName: "press_key", input: { key: "Enter" }, output: "Pressed \"Enter\" key" } }));

// Second navigate
run3Lines.push(JSON.stringify({ ts: t3(8000), elapsed: 8000, category: "tool", event: "call", data: { toolName: "navigate", input: { url: "https://www.youtube.com/results?search_query=funny+cats" } } }));
run3Lines.push(JSON.stringify({ ts: t3(9000), elapsed: 9000, category: "navigate", event: "success", data: { url: "https://www.youtube.com/results", finalUrl: "https://www.youtube.com/results?search_query=funny+cats", title: "funny cats - YouTube" } }));
run3Lines.push(JSON.stringify({ ts: t3(9001), elapsed: 9001, category: "tool", event: "result", data: { toolName: "navigate", input: { url: "https://www.youtube.com/results" }, output: "Navigated to https://www.youtube.com/results -- page title: \"funny cats - YouTube\"" } }));

// BUG: using stale ref=1 from BEFORE navigation
run3Lines.push(JSON.stringify({ ts: t3(9500), elapsed: 9500, category: "tool", event: "call", data: { toolName: "click", input: { ref: 1 } } }));
run3Lines.push(JSON.stringify({ ts: t3(10000), elapsed: 10000, category: "tool", event: "result", data: { toolName: "click", input: { ref: 1 }, output: "Error: Element ref=1 is a <div>, not clickable" } }));

// Run end
run3Lines.push(JSON.stringify({ ts: t3(11000), elapsed: 11000, category: "run", event: "end", data: { totalEvents: 20, durationMs: 11000 } }));

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------
const run1Path = join(outDir, "run1-cold.json");
const run2Path = join(outDir, "run2-warm.json");
const run3Path = join(outDir, "run3-buggy.json");

writeFileSync(run1Path, run1Lines.join("\n") + "\n", "utf-8");
writeFileSync(run2Path, run2Lines.join("\n") + "\n", "utf-8");
writeFileSync(run3Path, run3Lines.join("\n") + "\n", "utf-8");

console.log("Synthetic traces written:");
console.log(`  ${run1Path}`);
console.log(`  ${run2Path}`);
console.log(`  ${run3Path}`);
console.log("");
console.log("Run the analyzer with:");
console.log(`  npx tsx tests/blueprint-validation/analyze-traces.ts ${run1Path} ${run2Path}`);
console.log(`  npx tsx tests/blueprint-validation/analyze-traces.ts ${run3Path}`);
