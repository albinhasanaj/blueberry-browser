import type { BrowserToolDeps } from "../../browserTools";
import type { LLMRouter } from "../../llmRouter";
import type { LLMProvider } from "../../types";
import type { CompanionDeclaration, CompanionEvent } from "../types";
import type { CompanionMarketplaceService } from "../../../companionMarketplace/service";

export interface FinalResponsePayload {
  text: string;
  responseId?: string | null;
}

export interface OrchestrationParams {
  userMessage: string;
  deps: BrowserToolDeps;
  router: LLMRouter;
  llmProvider: LLMProvider;
  llmModel: string;
  previousOpenAIResponseId?: string | null;
  onCompanionEvent: (event: CompanionEvent) => void;
  onFinalResponse: (payload: FinalResponsePayload) => void;
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
