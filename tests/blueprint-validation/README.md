# Blueprint Cache Validation Tests

## How to test

### Step 1: Run the app twice with the same prompt

```bash
pnpm dev
```

1. **Run 1 (cold cache):** Type this prompt into the agent:
   > go to youtube, search for "funny cats", and open the first video

2. Wait for it to finish. The agent will explore, learn selectors, and save them.

3. **Clear the chat** (click the + button or reload), then type the **exact same prompt** again:
   > go to youtube, search for "funny cats", and open the first video

4. Wait for it to finish. This time it should use cached selectors.

Each run creates a trace file in `%APPDATA%/blueberry-browser/traces/`.

### Step 2: Analyze the traces

```bash
# Auto-find latest two traces:
npx tsx tests/blueprint-validation/analyze-traces.ts

# Or specify files explicitly:
npx tsx tests/blueprint-validation/analyze-traces.ts path/to/run-1.json path/to/run-2.json
```

### What the analyzer checks

#### Per-run validation (detects bugs):
| Check | What it catches |
|-------|----------------|
| `no-failed-selectors-learned` | **BUG 1**: Failed find() selectors leaking into cache |
| `failures-recorded-to-db` | Failed selectors not being recorded as failures |
| `no-stale-refs-after-nav` | **BUG 2**: Agent reusing refs after navigation |
| `ref-invalidation-warning-present` | Navigate results missing the warning |
| `domain-resolution` | Domain being read from wrong URL source |
| `garbage-selector-rejection` | Garbage pattern filter working |
| `mid-task-hint-injection` | Hints injected after navigation to known domain |
| `hints-at-start` | Hints present in system prompt at task start |

#### Run comparison (detects improvement):
| Check | What it measures |
|-------|-----------------|
| `step-count` | Run 2 should have fewer tool calls |
| `duration` | Run 2 should be faster |
| `hints-available-on-repeat` | Run 2 should have cached hints |
| `read-page-calls` | Run 2 should skip page scans |
| `find-calls` | Run 2 should need fewer find() calls |
| `selector-direct-usage` | Run 2 should use selectors directly |
| `error-count` | Run 2 should have fewer errors |

### Expected results

**Run 1 (first visit):**
- `hints-at-start`: INFO (no hints yet)
- `no-failed-selectors-learned`: PASS
- Selectors get LEARNED and UPSERTED

**Run 2 (repeat visit):**
- `hints-at-start`: PASS (hints injected!)
- `mid-task-hint-injection`: shows injection after navigate
- Step count should drop from ~8-10 to ~4-5
- Agent uses `click({selector})` directly instead of `read_page` + `click({ref})`

### If tests FAIL

- `no-failed-selectors-learned` FAIL → Bug 1 fix not working
- `no-stale-refs-after-nav` FAIL → Bug 2 fix not working  
- `domain-resolution` WARN → Domain still being read from wrong tab
- `hints-available-on-repeat` REGRESSED → Cache not persisting between runs
