import type {
  CompanionDraft,
  PublishedCompanion,
} from "../../shared/companionMarketplace";

type RosterEntry = {
  id: string;
  name: string;
  role: "orchestrator" | "worker";
  summary: string;
  source?: "core" | "community";
};

function normalizeRosterSummary(summary: string): string {
  return summary.trim().replace(/\s+/g, " ");
}

export function renderCompanionRoster(entries: RosterEntry[]): string {
  return entries
    .map((entry) => {
      const sourceLabel = entry.source === "community" ? "community" : "core";
      return `- ${entry.name} (\`${entry.id}\`, ${sourceLabel}, ${entry.role}): ${normalizeRosterSummary(entry.summary)}`;
    })
    .join("\n");
}

export function composeMarketplacePrompt(params: {
  companion: CompanionDraft | PublishedCompanion;
  currentDate: string;
  sharedRulesTemplate: string;
  rosterText: string;
}): string {
  const { companion, currentDate, sharedRulesTemplate, rosterText } = params;
  const tags = companion.tags.length > 0 ? companion.tags.join(", ") : "none";

  const sharedRules = sharedRulesTemplate
    .replaceAll("{{currentDate}}", currentDate)
    .replaceAll("{{teamRoster}}", rosterText);

  return [
    "# Identity",
    `You are ${companion.name}, a community-built Blueberry worker companion.`,
    "",
    "# Description",
    companion.description.trim(),
    "",
    "# Best For",
    companion.bestFor.trim(),
    "",
    "# Instructions",
    companion.instructions.trim(),
    "",
    "# Metadata",
    `Tags: ${tags}`,
    `Preferred tool profile: ${companion.toolProfile}`,
    "",
    sharedRules.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}
