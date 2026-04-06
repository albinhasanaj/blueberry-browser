import type {
  CompanionToolName,
  CompanionToolProfile,
} from "../../shared/companionMarketplace";

export const ALL_COMPANION_TOOLS: CompanionToolName[] = [
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
];

export const RESEARCH_TOOLS: CompanionToolName[] = [
  "read_page",
  "get_page_text",
  "find",
  "navigate",
  "screenshot",
  "open_tab",
  "javascript",
];

export const INTERACTIVE_TOOLS: CompanionToolName[] = [
  ...RESEARCH_TOOLS,
  "click",
  "type",
  "press_key",
];

export function getDefaultToolsForProfile(
  profile: CompanionToolProfile,
): CompanionToolName[] {
  return profile === "interactive" ? [...INTERACTIVE_TOOLS] : [...RESEARCH_TOOLS];
}

export function normalizeToolList(
  tools: CompanionToolName[],
  profile: CompanionToolProfile,
): CompanionToolName[] {
  const allowed = new Set(ALL_COMPANION_TOOLS);
  const baseTools = new Set(getDefaultToolsForProfile(profile));

  for (const tool of tools) {
    if (!allowed.has(tool)) continue;
    baseTools.add(tool);
  }

  return ALL_COMPANION_TOOLS.filter((tool) => baseTools.has(tool));
}
