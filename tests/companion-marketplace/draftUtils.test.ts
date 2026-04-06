import test from "node:test";
import assert from "node:assert/strict";
import { applyBuilderPatch, createEmptyDraft, validateDraftForPublish } from "../../src/main/companionMarketplace/draftUtils";

test("applyBuilderPatch updates canonical fields and resets tool defaults on profile change", () => {
  const draft = createEmptyDraft("community-test", "2026-04-06T00:00:00.000Z");

  const updated = applyBuilderPatch(
    draft,
    {
      name: "Research Scout",
      description: "Finds niche tools.",
      instructions: "Be concrete and cite pages.",
      bestFor: "Tool discovery and comparisons.",
      tags: ["research", "tools", "tools"],
      conversationStarters: ["Find SEO tools", "Find SEO tools", "Compare CRM options"],
      toolProfile: "interactive",
    },
    "2026-04-06T00:05:00.000Z",
  );

  assert.equal(updated.name, "Research Scout");
  assert.equal(updated.avatarLabel, "RS");
  assert.deepEqual(updated.tags, ["research", "tools"]);
  assert.deepEqual(updated.conversationStarters, [
    "Find SEO tools",
    "Compare CRM options",
  ]);
  assert.equal(updated.toolProfile, "interactive");
  assert(updated.tools.includes("click"));
  assert(updated.tools.includes("type"));
  assert(updated.tools.includes("press_key"));
});

test("validateDraftForPublish reports missing required fields", () => {
  const draft = createEmptyDraft("community-test", "2026-04-06T00:00:00.000Z");
  const errors = validateDraftForPublish(draft);

  assert.deepEqual(errors, [
    "Name is required.",
    "Description is required.",
    "Instructions are required.",
    "Best-for summary is required.",
  ]);
});
