import { z } from "zod";
import type {
  BuilderPatch,
  BuilderMessage,
  CompanionDraft,
  CompanionToolName,
} from "../../shared/companionMarketplace";
import { getDefaultToolsForProfile, normalizeToolList } from "./tooling";

const toolNameSchema = z.enum([
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
]);

export const builderPatchSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    instructions: z.string().optional(),
    bestFor: z.string().optional(),
    tags: z.array(z.string()).optional(),
    conversationStarters: z.array(z.string()).optional(),
    temperature: z.number().min(0).max(1).optional(),
    maxSteps: z.number().int().min(10).max(250).optional(),
    toolProfile: z.enum(["research", "interactive"]).optional(),
    tools: z.array(toolNameSchema).optional(),
  })
  .strict();

export function buildAvatarLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "N";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function normalizeText(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  return value.trim();
}

function normalizeStringList(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;

  return values
    .map((value) => value.trim())
    .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);
}

export function createEmptyDraft(
  id: string,
  nowIso: string,
  starterMessages: BuilderMessage[] = [],
): CompanionDraft {
  return {
    id,
    source: "community",
    status: "draft",
    name: "",
    description: "",
    instructions: "",
    bestFor: "",
    tags: [],
    conversationStarters: [],
    temperature: 0.4,
    maxSteps: 80,
    toolProfile: "research",
    tools: getDefaultToolsForProfile("research"),
    avatarLabel: "N",
    builderMessages: starterMessages,
    readOnly: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: null,
    lastError: null,
  };
}

export function applyBuilderPatch(
  draft: CompanionDraft,
  patch: BuilderPatch,
  nowIso: string,
): CompanionDraft {
  const parsedPatch = builderPatchSchema.parse(patch);
  const nextProfile = parsedPatch.toolProfile ?? draft.toolProfile;
  const patchedTools =
    parsedPatch.tools != null
      ? normalizeToolList(parsedPatch.tools, nextProfile)
      : parsedPatch.toolProfile != null
        ? getDefaultToolsForProfile(nextProfile)
        : draft.tools;

  const nextDraft: CompanionDraft = {
    ...draft,
    name: normalizeText(parsedPatch.name) ?? draft.name,
    description: normalizeText(parsedPatch.description) ?? draft.description,
    instructions:
      normalizeText(parsedPatch.instructions) ?? draft.instructions,
    bestFor: normalizeText(parsedPatch.bestFor) ?? draft.bestFor,
    tags: normalizeStringList(parsedPatch.tags) ?? draft.tags,
    conversationStarters:
      normalizeStringList(parsedPatch.conversationStarters) ??
      draft.conversationStarters,
    temperature: parsedPatch.temperature ?? draft.temperature,
    maxSteps: parsedPatch.maxSteps ?? draft.maxSteps,
    toolProfile: nextProfile,
    tools: patchedTools,
    updatedAt: nowIso,
  };

  return {
    ...nextDraft,
    avatarLabel: buildAvatarLabel(nextDraft.name),
  };
}

export function validateDraftForPublish(draft: CompanionDraft): string[] {
  const errors: string[] = [];

  if (!draft.name.trim()) errors.push("Name is required.");
  if (!draft.description.trim()) errors.push("Description is required.");
  if (!draft.instructions.trim()) errors.push("Instructions are required.");
  if (!draft.bestFor.trim()) errors.push("Best-for summary is required.");
  if (draft.tools.length === 0) errors.push("At least one tool is required.");

  return errors;
}

export function splitCommaSeparated(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toolSetIncludes(
  tools: CompanionToolName[],
  tool: CompanionToolName,
): boolean {
  return tools.includes(tool);
}
