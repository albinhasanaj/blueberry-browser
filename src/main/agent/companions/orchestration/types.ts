import type { BrowserToolDeps } from "../../browserTools";
import type { CompanionDeclaration, CompanionEvent } from "../types";
import type { CompanionMarketplaceService } from "../../../companionMarketplace/service";

export interface OrchestrationParams {
  userMessage: string;
  deps: BrowserToolDeps;
  onCompanionEvent: (event: CompanionEvent) => void;
  onFinalResponse: (text: string) => void;
  abortSignal?: AbortSignal;
  conversationHistory?: Array<{ role: string; content: string }>;
  marketplaceService: CompanionMarketplaceService;
}

export interface TaskPlanTask {
  companionKind?: "core" | "marketplace";
  companionId: string;
  task: string;
  reason: string;
}

export interface TaskPlan {
  tasks: TaskPlanTask[];
}

export type CompanionIdentity = Pick<
  CompanionDeclaration,
  "id" | "name" | "emoji"
>;
