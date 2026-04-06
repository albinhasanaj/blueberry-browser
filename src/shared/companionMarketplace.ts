export type CompanionStatus =
  | "draft"
  | "publishing"
  | "published"
  | "error";

export type CompanionSource = "core" | "community";

export type CompanionToolProfile = "research" | "interactive";

export type CompanionToolName =
  | "read_page"
  | "get_page_text"
  | "find"
  | "click"
  | "type"
  | "press_key"
  | "navigate"
  | "screenshot"
  | "open_tab"
  | "javascript";

export interface BuilderMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface CompanionRecordBase {
  id: string;
  source: CompanionSource;
  status: CompanionStatus;
  name: string;
  description: string;
  instructions: string;
  bestFor: string;
  tags: string[];
  conversationStarters: string[];
  temperature: number;
  maxSteps: number;
  toolProfile: CompanionToolProfile;
  tools: CompanionToolName[];
  avatarLabel: string;
  builderMessages: BuilderMessage[];
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lastError: string | null;
}

export interface CompanionDraft extends CompanionRecordBase {
  source: "community";
  status: "draft" | "publishing" | "error";
  readOnly: false;
}

export interface PublishedCompanion extends CompanionRecordBase {
  status: "published";
}

export type CatalogCompanion = CompanionDraft | PublishedCompanion;

export interface BuilderPatch {
  name?: string;
  description?: string;
  instructions?: string;
  bestFor?: string;
  tags?: string[];
  conversationStarters?: string[];
  temperature?: number;
  maxSteps?: number;
  toolProfile?: CompanionToolProfile;
  tools?: CompanionToolName[];
}

export interface CompanionSearchResult {
  companion: PublishedCompanion;
  score: number;
  keywordScore: number;
  semanticScore: number;
  matchReason: string;
}

export interface CompanionCatalogSnapshot {
  coreCompanions: PublishedCompanion[];
  communityCompanions: PublishedCompanion[];
  drafts: CompanionDraft[];
}

export interface BuilderAssistantResult {
  draft: CompanionDraft;
  reply: string;
  patch: BuilderPatch;
}

export interface CompanionPreviewRequest {
  draftId: string;
  message: string;
  messages: BuilderMessage[];
}

export interface CompanionPreviewResult {
  reply: string;
}
