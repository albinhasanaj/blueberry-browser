import test from "node:test";
import assert from "node:assert/strict";
import { LLMRouter } from "../../src/main/agent/llmRouter";

const ORIGINAL_ENV = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test.afterEach(() => {
  restoreEnv();
});

test("LLMRouter resolves OpenAI chat routes with Responses defaults", () => {
  process.env.LLM_PROVIDER = "openai";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  process.env.OPENAI_API_KEY = "test-openai-key";

  const router = new LLMRouter();
  const route = router.resolve("chat", {
    previousOpenAIResponseId: "resp_123",
  });

  assert.equal(route.provider, "openai");
  assert.equal(route.model, "gpt-5-mini");
  assert.deepEqual(route.providerOptions.openai, {
    reasoningEffort: "medium",
    reasoningSummary: "auto",
    store: true,
    previousResponseId: "resp_123",
  });
});

test("LLMRouter keeps worker routes stateless for OpenAI with low reasoning", () => {
  process.env.LLM_PROVIDER = "openai";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  process.env.OPENAI_API_KEY = "test-openai-key";

  const router = new LLMRouter();
  const route = router.resolve("worker");

  assert.equal(route.provider, "openai");
  assert.deepEqual(route.providerOptions.openai, {
    reasoningEffort: "low",
    reasoningSummary: "concise",
    store: false,
    previousResponseId: undefined,
  });
});

test("LLMRouter resolves Anthropic routes with reasoning enabled", () => {
  process.env.LLM_PROVIDER = "anthropic";
  process.env.ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

  const router = new LLMRouter();
  const route = router.resolve("worker");

  assert.equal(route.provider, "anthropic");
  assert.equal(route.model, "claude-sonnet-4-20250514");
  assert.deepEqual(route.providerOptions.anthropic, {
    sendReasoning: true,
    thinking: { type: "enabled", budgetTokens: 1024 },
  });
});

test("LLMRouter fails fast when the active provider key is missing", () => {
  process.env.LLM_PROVIDER = "openai";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  delete process.env.OPENAI_API_KEY;

  const router = new LLMRouter();
  assert.throws(() => router.resolve("chat"), /OPENAI_API_KEY is not configured/);
});
