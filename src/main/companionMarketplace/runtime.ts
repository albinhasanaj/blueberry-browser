import { loadPrompt } from "../agent/prompts/loadPrompt";
import type { CompanionDeclaration } from "../agent/companions/types";
import type {
  CompanionDraft,
  PublishedCompanion,
} from "../../shared/companionMarketplace";
import { buildAvatarLabel } from "./draftUtils";
import { composeMarketplacePrompt, renderCompanionRoster } from "./promptComposer";

export function buildEmbeddingText(
  companion: Pick<
    CompanionDraft | PublishedCompanion,
    "name" | "description" | "instructions" | "bestFor" | "tags"
  >,
): string {
  return [
    companion.name,
    companion.description,
    companion.bestFor,
    companion.instructions,
    companion.tags.join(", "),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function catalogCompanionToDeclaration(params: {
  companion: PublishedCompanion;
  availableWorkers: CompanionDeclaration[];
}): CompanionDeclaration {
  const rosterText = renderCompanionRoster(
    params.availableWorkers.map((worker) => ({
      id: worker.id,
      name: worker.name,
      role: worker.role,
      source: worker.source ?? "core",
      summary: (
        worker.bestFor ??
        worker.description ??
        worker.capabilities.join(", ")
      ) || "General browser specialist",
    })),
  );

  return {
    id: params.companion.id,
    name: params.companion.name,
    emoji: params.companion.avatarLabel || buildAvatarLabel(params.companion.name),
    role: "worker",
    source: "community",
    description: params.companion.description,
    bestFor: params.companion.bestFor,
    tags: params.companion.tags,
    capabilities: [],
    toolset: [...params.companion.tools],
    systemPrompt: composeMarketplacePrompt({
      companion: params.companion,
      currentDate: new Date().toISOString().split("T")[0],
      sharedRulesTemplate: loadPrompt("companions/shared-worker-rules"),
      rosterText,
    }),
    maxSteps: params.companion.maxSteps,
    temperature: params.companion.temperature,
  };
}

export function buildCoreRoster(coreCompanions: CompanionDeclaration[]): string {
  return renderCompanionRoster(
    coreCompanions.map((companion) => ({
      id: companion.id,
      name: companion.name,
      role: companion.role,
      source: companion.source ?? "core",
      summary: (
        companion.bestFor ??
        companion.description ??
        companion.capabilities.join(", ")
      ) || "Core browser companion",
    })),
  );
}
