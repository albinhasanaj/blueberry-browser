import test from "node:test";
import assert from "node:assert/strict";
import { createStreamAggregator } from "../../src/main/agent/streamAggregation";

test("stream aggregator keeps text and reasoning separate", () => {
  const textUpdates: string[] = [];
  const reasoningUpdates: string[] = [];

  const aggregate = createStreamAggregator({
    onTextDelta: (text) => {
      textUpdates.push(text);
    },
    onReasoningDelta: (reasoning) => {
      reasoningUpdates.push(reasoning);
    },
  });

  aggregate.consume({
    type: "reasoning-delta",
    id: "r1",
    text: "Plan the answer.",
  } as never);
  aggregate.consume({
    type: "text-delta",
    id: "t1",
    text: "Final answer",
  } as never);
  aggregate.consume({
    type: "finish-step",
    response: {} as never,
    usage: {} as never,
    finishReason: "stop",
    rawFinishReason: "stop",
    providerMetadata: {
      openai: {
        responseId: "resp_abc",
      },
    },
  } as never);

  const result = aggregate.finalize();

  assert.equal(result.reasoning, "Plan the answer.");
  assert.equal(result.text, "Final answer");
  assert.equal(result.responseId, "resp_abc");
  assert.deepEqual(reasoningUpdates, ["Plan the answer."]);
  assert.deepEqual(textUpdates, ["Final answer"]);
});

test("stream aggregator leaves reasoning empty when no reasoning parts are present", () => {
  const aggregate = createStreamAggregator();

  aggregate.consume({
    type: "text-delta",
    id: "t1",
    text: "Only answer text",
  } as never);

  const result = aggregate.finalize({
    openai: {
      responseId: "resp_only_text",
    },
  });

  assert.equal(result.reasoning, "");
  assert.equal(result.text, "Only answer text");
  assert.equal(result.responseId, "resp_only_text");
});
