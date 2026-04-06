import { ElectronAPI } from "@electron-toolkit/preload";
import type {
  BuilderAssistantResult,
  BuilderPatch,
  CatalogCompanion,
  CompanionCatalogSnapshot,
  CompanionPreviewRequest,
  CompanionPreviewResult,
  CompanionSearchResult,
  PublishedCompanion,
} from "../shared/companionMarketplace";

interface CompanionAPI {
  listCompanions: () => Promise<CompanionCatalogSnapshot>;
  searchCompanions: (query: string) => Promise<CompanionSearchResult[]>;
  getCompanion: (companionId: string) => Promise<CatalogCompanion | null>;
  createDraftCompanion: () => Promise<CatalogCompanion>;
  updateDraftCompanion: (
    companionId: string,
    patch: BuilderPatch,
  ) => Promise<CatalogCompanion>;
  chatCompanionBuilder: (
    companionId: string,
    message: string,
  ) => Promise<BuilderAssistantResult>;
  previewCompanionDraft: (
    input: CompanionPreviewRequest,
  ) => Promise<CompanionPreviewResult>;
  publishCompanionDraft: (
    companionId: string,
  ) => Promise<PublishedCompanion>;
}

// Newtab uses the same sidebarAPI shape as sidebar.d.ts
declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
    companionAPI: CompanionAPI;
  }
}
