import type { PublishedCompanion } from "../../shared/companionMarketplace";
import { buildAvatarLabel } from "./draftUtils";
import { getAllCompanions } from "../agent/companions/registry";

export function getCoreCatalogCompanions(): PublishedCompanion[] {
  const nowIso = new Date().toISOString();

  return getAllCompanions().map((companion) => ({
    id: companion.id,
    source: "core",
    status: "published",
    name: companion.name,
    description: companion.description ?? companion.name,
    instructions: companion.systemPrompt,
    bestFor:
      (companion.bestFor ??
        companion.description ??
        companion.capabilities.join(", ")) ||
      "General browser work",
    tags: companion.tags ?? companion.capabilities,
    conversationStarters: [],
    temperature: companion.temperature,
    maxSteps: companion.maxSteps,
    toolProfile: companion.toolset.includes("click") ? "interactive" : "research",
    tools: companion.toolset.filter(
      (tool): tool is PublishedCompanion["tools"][number] =>
        [
          "read_page",
          "get_page_text",
          "find",
          "click",
          "type",
          "press_key",
          "navigate",
          "screenshot",
          "open_tab",
          "javascript",
        ].includes(tool),
    ),
    avatarLabel: buildAvatarLabel(companion.name),
    builderMessages: [],
    readOnly: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: nowIso,
    lastError: null,
  }));
}
