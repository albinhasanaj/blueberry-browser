import test from "node:test";
import assert from "node:assert/strict";
import { composeMarketplacePrompt, renderCompanionRoster } from "../../src/main/companionMarketplace/promptComposer";
import { createEmptyDraft } from "../../src/main/companionMarketplace/draftUtils";

test("renderCompanionRoster includes role and source context", () => {
  const roster = renderCompanionRoster([
    {
      id: "blueberry",
      name: "Blueberry",
      role: "orchestrator",
      source: "core",
      summary: "General browser work",
    },
    {
      id: "community-seo",
      name: "SEO Scout",
      role: "worker",
      source: "community",
      summary: "SEO audits and keyword research",
    },
  ]);

  assert.match(roster, /Blueberry \(`blueberry`, core, orchestrator\)/);
  assert.match(roster, /SEO Scout \(`community-seo`, community, worker\)/);
});

test("composeMarketplacePrompt injects draft fields and shared rules placeholders", () => {
  const draft = {
    ...createEmptyDraft("community-seo", "2026-04-06T00:00:00.000Z"),
    name: "SEO Scout",
    description: "Finds ranking opportunities.",
    bestFor: "SEO audits and keyword research.",
    instructions: "Always explain why the keyword matters.",
    tags: ["seo", "content"],
  };

  const prompt = composeMarketplacePrompt({
    companion: draft,
    currentDate: "2026-04-06",
    sharedRulesTemplate:
      "Today is {{currentDate}}.\nTeam:\n{{teamRoster}}\nUse submit_result when done.",
    rosterText: "- Blueberry (`blueberry`, core, orchestrator): orchestration",
  });

  assert.match(prompt, /You are SEO Scout/);
  assert.match(prompt, /SEO audits and keyword research/);
  assert.match(prompt, /Today is 2026-04-06/);
  assert.match(prompt, /Blueberry \(`blueberry`, core, orchestrator\)/);
});
