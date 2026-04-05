import type { CompanionCapability, CompanionDeclaration } from "./types";
import { loadPrompt } from "../prompts/loadPrompt";

const companions = new Map<string, CompanionDeclaration>();

const BLUEBERRY: CompanionDeclaration = {
  id: "blueberry",
  name: "Blueberry",
  emoji: "🫐",
  role: "orchestrator",
  capabilities: ["synthesis"],
  toolset: [],
  systemPrompt: loadPrompt("companions/blueberry"),
  maxSteps: 10,
  temperature: 0.3,
};

const SALLY: CompanionDeclaration = {
  id: "sally",
  name: "Sally",
  emoji: "🍓",
  role: "worker",
  capabilities: ["lead_generation", "outreach"],
  toolset: [
    "read_page",
    "find",
    "click",
    "type",
    "press_key",
    "navigate",
    "screenshot",
    "open_tab",
    "javascript",
  ],
  systemPrompt: loadPrompt("companions/sally"),
  maxSteps: 50,
  temperature: 0.6,
};

const CAMILLE: CompanionDeclaration = {
  id: "camille",
  name: "Camille",
  emoji: "🔍",
  role: "worker",
  capabilities: ["competitor_analysis", "lead_generation"],
  toolset: ["read_page", "find", "navigate", "screenshot", "open_tab", "javascript"],
  systemPrompt: loadPrompt("companions/camille"),
  maxSteps: 40,
  temperature: 0.5,
};

const ELLA: CompanionDeclaration = {
  id: "ella",
  name: "Ella",
  emoji: "📊",
  role: "worker",
  capabilities: ["data_extraction", "lead_generation"],
  toolset: [
    "read_page",
    "find",
    "click",
    "type",
    "press_key",
    "navigate",
    "screenshot",
    "javascript",
    "open_tab",
  ],
  systemPrompt: loadPrompt("companions/ella"),
  maxSteps: 50,
  temperature: 0.7,
};

function seedDefaults(): void {
  if (companions.size > 0) return;
  companions.set(BLUEBERRY.id, BLUEBERRY);
  companions.set(SALLY.id, SALLY);
  companions.set(CAMILLE.id, CAMILLE);
  companions.set(ELLA.id, ELLA);
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
