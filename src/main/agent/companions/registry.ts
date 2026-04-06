import type { CompanionCapability, CompanionDeclaration } from "./types";
import { loadPrompt } from "../prompts/loadPrompt";

const companions = new Map<string, CompanionDeclaration>();

/** Compose a worker system prompt: companion-specific identity + shared rules */
function workerPrompt(companionName: string): string {
  const identity = loadPrompt(`companions/${companionName}`);
  const shared = loadPrompt("companions/shared-worker-rules")
    .replaceAll("{{currentDate}}", new Date().toISOString().split("T")[0])
    .replaceAll(
      "{{teamRoster}}",
      [
        "- Blueberry (`blueberry`, core orchestrator): general browser work, orchestration, synthesis",
        "- Sally (`sally`, core worker): lead generation, outreach, sales research",
        "- Camille (`camille`, core worker): competitor analysis, market research, positioning",
        "- Ella (`ella`, core worker): data extraction, structured scraping, pulling numbers from pages",
      ].join("\n"),
    );
  return identity + "\n\n" + shared;
}

const BLUEBERRY: CompanionDeclaration = {
  id: "blueberry",
  name: "Blueberry",
  emoji: "🫐",
  role: "orchestrator",
  source: "core",
  description:
    "The browser orchestrator that plans work, delegates to specialists, and synthesizes final answers.",
  bestFor:
    "General browser tasks, multi-step orchestration, and synthesizing specialist results.",
  tags: ["orchestrator", "browser", "synthesis"],
  capabilities: ["synthesis"],
  toolset: [
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
  ],
  systemPrompt: loadPrompt("companions/blueberry"),
  maxSteps: 30,
  temperature: 0.3,
};

const SALLY: CompanionDeclaration = {
  id: "sally",
  name: "Sally",
  emoji: "🍓",
  role: "worker",
  source: "core",
  description:
    "Lead-generation and outreach specialist focused on contacts, prospect lists, and sales research.",
  bestFor:
    "Sales prospecting, contact discovery, outreach prep, and lead qualification.",
  tags: ["sales", "outreach", "prospecting"],
  capabilities: ["lead_generation", "outreach"],
  toolset: [
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
    "delegate",
  ],
  systemPrompt: workerPrompt("sally"),
  maxSteps: 100,
  temperature: 0.6,
};

const CAMILLE: CompanionDeclaration = {
  id: "camille",
  name: "Camille",
  emoji: "🔍",
  role: "worker",
  source: "core",
  description:
    "Market and competitor researcher for positioning, landscape analysis, and trend scouting.",
  bestFor:
    "Market research, competitor analysis, positioning work, and strategic research tasks.",
  tags: ["research", "competition", "market"],
  capabilities: ["competitor_analysis", "lead_generation"],
  toolset: ["read_page", "get_page_text", "find", "navigate", "screenshot", "open_tab", "javascript", "delegate"],
  systemPrompt: workerPrompt("camille"),
  maxSteps: 100,
  temperature: 0.5,
};

const ELLA: CompanionDeclaration = {
  id: "ella",
  name: "Ella",
  emoji: "📊",
  role: "worker",
  source: "core",
  description:
    "Structured data extraction specialist for scraping lists, metrics, and other page-level facts.",
  bestFor:
    "Structured extraction, list scraping, and pulling numbers from websites.",
  tags: ["scraping", "data", "extraction"],
  capabilities: ["data_extraction", "lead_generation"],
  toolset: [
    "read_page",
    "get_page_text",
    "find",
    "click",
    "type",
    "press_key",
    "navigate",
    "screenshot",
    "javascript",
    "open_tab",
    "delegate",
  ],
  systemPrompt: workerPrompt("ella"),
  maxSteps: 150,
  temperature: 0.7,
};

const ARCHER: CompanionDeclaration = {
  id: "archer",
  name: "Archer",
  emoji: "🏗️",
  role: "worker",
  source: "core",
  description:
    "Companion architect who researches domains and designs fully-configured companion specifications.",
  bestFor:
    "Building new companions — researches best practices and creates companion specs with expert-level instructions.",
  tags: ["companion", "builder", "architect", "research"],
  capabilities: ["companion_building"],
  toolset: [
    "read_page",
    "get_page_text",
    "find",
    "navigate",
    "screenshot",
    "open_tab",
    "javascript",
    "delegate",
  ],
  systemPrompt: workerPrompt("archer"),
  maxSteps: 100,
  temperature: 0.5,
};

function seedDefaults(): void {
  if (companions.size > 0) return;
  companions.set(BLUEBERRY.id, BLUEBERRY);
  companions.set(SALLY.id, SALLY);
  companions.set(CAMILLE.id, CAMILLE);
  companions.set(ELLA.id, ELLA);
  companions.set(ARCHER.id, ARCHER);
}

seedDefaults();

export function registerCompanion(decl: CompanionDeclaration): void {
  companions.set(decl.id, decl);
}

export function getCompanion(id: string): CompanionDeclaration {
  const c = companions.get(id);
  if (!c) throw new Error(`Companion "${id}" not found in registry`);
  return c;
}

export function findByCapability(cap: CompanionCapability): CompanionDeclaration[] {
  return Array.from(companions.values()).filter((c) => c.capabilities.includes(cap));
}

export function getAllCompanions(): CompanionDeclaration[] {
  return Array.from(companions.values());
}

export function getOrchestratorCompanion(): CompanionDeclaration {
  const orch = Array.from(companions.values()).find((c) => c.role === "orchestrator");
  if (!orch) throw new Error("No orchestrator companion registered");
  return orch;
}
