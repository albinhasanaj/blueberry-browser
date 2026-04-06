import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ChatProvider } from "../../sidebar/src/contexts/ChatContext";
import { ActiveSessionView, EmptyState } from "./components/SessionView";
import { CompanionBrowseView } from "./components/CompanionBrowseView";
import { CompanionBuilderView } from "./components/CompanionBuilderView";
import { NewTabSidebar } from "./components/NewTabSidebar";
import { useNewTabController } from "./hooks/useNewTabController";
import type {
  BuilderMessage,
  BuilderPatch,
  CompanionCatalogSnapshot,
  CompanionDraft,
  CompanionSearchResult,
} from "../../../shared/companionMarketplace";

const EMPTY_CATALOG: CompanionCatalogSnapshot = {
  coreCompanions: [],
  communityCompanions: [],
  drafts: [],
};

type WorkspaceMode = "chat" | "browse" | "build";

const NewTabContent: React.FC = () => {
  const {
    companionEvents,
    handleHistorySelect,
    hasSessionContent,
    history,
    historyRef,
    isHistoryOpen,
    isLoading,
    sendMessage,
    sourcePage,
    stopAgent,
    title,
    toggleHistory,
    toolEvents,
    visibleMessages,
  } = useNewTabController();

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("chat");
  const [catalog, setCatalog] = useState<CompanionCatalogSnapshot>(EMPTY_CATALOG);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResults, setSearchResults] = useState<CompanionSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [builderBusy, setBuilderBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<BuilderMessage[]>([]);
  const [creatingDraft, setCreatingDraft] = useState(false);

  const selectedDraft = useMemo(
    () => catalog.drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [catalog.drafts, selectedDraftId],
  );

  // Keep chat mode accessible even without session content (shows EmptyState)

  useEffect(() => {
    const loadCatalog = async (): Promise<void> => {
      try {
        const nextCatalog = await window.companionAPI.listCompanions();
        setCatalog(nextCatalog);
        setCatalogError(null);
        setSelectedDraftId((currentId) => {
          if (currentId && nextCatalog.drafts.some((draft) => draft.id === currentId)) {
            return currentId;
          }
          return nextCatalog.drafts[0]?.id ?? null;
        });
      } catch (error) {
        setCatalogError(
          error instanceof Error ? error.message : "Failed to load companions.",
        );
      }
    };

    void loadCatalog();
  }, []);

  useEffect(() => {
    if (workspaceMode !== "build") return;
    if (selectedDraftId || creatingDraft) return;

    if (catalog.drafts.length > 0) {
      setSelectedDraftId(catalog.drafts[0].id);
      return;
    }

    setCreatingDraft(true);
    void window.companionAPI
      .createDraftCompanion()
      .then((draft) => {
        startTransition(() => {
          setCatalog((current) => ({
            ...current,
            drafts: [draft as CompanionDraft, ...current.drafts],
          }));
          setSelectedDraftId((draft as CompanionDraft).id);
        });
      })
      .catch((error) => {
        setCatalogError(
          error instanceof Error ? error.message : "Failed to create draft.",
        );
      })
      .finally(() => setCreatingDraft(false));
  }, [catalog.drafts, creatingDraft, selectedDraftId, workspaceMode]);

  useEffect(() => {
    let cancelled = false;

    const runSearch = async (): Promise<void> => {
      const query = deferredSearchQuery.trim();
      if (!query) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const results = await window.companionAPI.searchCompanions(query);
        if (!cancelled) {
          startTransition(() => setSearchResults(results));
        }
      } catch (error) {
        if (!cancelled) {
          setCatalogError(
            error instanceof Error ? error.message : "Failed to search companions.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    };

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [deferredSearchQuery]);

  const upsertDraft = (draft: CompanionDraft): void => {
    setCatalog((current) => ({
      ...current,
      drafts: [draft, ...current.drafts.filter((item) => item.id !== draft.id)],
    }));
    setSelectedDraftId(draft.id);
  };

  const refreshCatalog = async (preferredDraftId?: string): Promise<void> => {
    const nextCatalog = await window.companionAPI.listCompanions();
    setCatalog(nextCatalog);
    setSelectedDraftId((currentId) => {
      const nextId = preferredDraftId ?? currentId;
      if (nextId && nextCatalog.drafts.some((draft) => draft.id === nextId)) {
        return nextId;
      }
      return nextCatalog.drafts[0]?.id ?? null;
    });
  };

  const handleCreateDraft = async (): Promise<void> => {
    setCreatingDraft(true);
    try {
      const draft = (await window.companionAPI.createDraftCompanion()) as CompanionDraft;
      upsertDraft(draft);
      setWorkspaceMode("build");
      setPreviewMessages([]);
      setStatusMessage(null);
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "Failed to create draft.",
      );
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleSavePatch = async (patch: BuilderPatch): Promise<void> => {
    if (!selectedDraft) return;

    try {
      const draft = (await window.companionAPI.updateDraftCompanion(
        selectedDraft.id,
        patch,
      )) as CompanionDraft;
      upsertDraft(draft);
      setStatusMessage("Draft saved");
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "Failed to save draft.",
      );
    }
  };

  const handleBuilderSend = async (message: string): Promise<void> => {
    if (!selectedDraft) return;

    setBuilderBusy(true);
    try {
      const result = await window.companionAPI.chatCompanionBuilder(
        selectedDraft.id,
        message,
      );
      upsertDraft(result.draft);
      setStatusMessage("Draft updated from builder chat");
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "Builder request failed.",
      );
    } finally {
      setBuilderBusy(false);
    }
  };

  const handlePreviewSend = async (message: string): Promise<void> => {
    if (!selectedDraft) return;

    const history = [...previewMessages];
    setPreviewMessages((current) => [
      ...current,
      {
        id: `${Date.now().toString(36)}-preview-user`,
        role: "user",
        content: message,
        createdAt: Date.now(),
      },
    ]);
    setPreviewBusy(true);

    try {
      const preview = await window.companionAPI.previewCompanionDraft({
        draftId: selectedDraft.id,
        message,
        messages: history,
      });
      setPreviewMessages((current) => [
        ...current,
        {
          id: `${Date.now().toString(36)}-preview-assistant`,
          role: "assistant",
          content: preview.reply,
          createdAt: Date.now(),
        },
      ]);
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "Preview request failed.",
      );
    } finally {
      setPreviewBusy(false);
    }
  };

  const handlePublish = async (): Promise<void> => {
    if (!selectedDraft) return;

    setPublishing(true);
    try {
      await window.companionAPI.publishCompanionDraft(selectedDraft.id);
      await refreshCatalog();
      setPreviewMessages([]);
      setWorkspaceMode("browse");
      setStatusMessage("Companion published locally");
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "Publish failed.",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#343332] text-[#f5f1e9]">
      <NewTabSidebar
        containerRef={historyRef}
        activeMode={workspaceMode}
        hasChatSession={hasSessionContent}
        history={history}
        isHistoryOpen={isHistoryOpen}
        onShowChat={() => setWorkspaceMode("chat")}
        onShowBrowse={() => setWorkspaceMode("browse")}
        onShowBuild={() => setWorkspaceMode("build")}
        onToggleHistory={toggleHistory}
        onSelectHistory={async (sessionId) => {
          await handleHistorySelect(sessionId);
          setWorkspaceMode("chat");
        }}
      />

      <main className="relative flex-1 overflow-hidden">
        {catalogError && (
          <div className="absolute right-6 top-6 z-20 rounded-full border border-red-400/20 bg-red-500/[0.10] px-4 py-2 text-xs text-red-100/80">
            {catalogError}
          </div>
        )}

        {workspaceMode === "chat" ? (
          hasSessionContent ? (
            <ActiveSessionView
              messages={visibleMessages}
              isLoading={isLoading}
              toolEvents={toolEvents}
              companionEvents={companionEvents}
              sendMessage={sendMessage}
              stopAgent={stopAgent}
              sourcePage={sourcePage}
            />
          ) : (
            <EmptyState
              sendMessage={sendMessage}
              isLoading={isLoading}
              title={title}
            />
          )
        ) : workspaceMode === "build" ? (
          <CompanionBuilderView
            drafts={catalog.drafts}
            selectedDraft={selectedDraft}
            builderMessages={selectedDraft?.builderMessages ?? []}
            previewMessages={previewMessages}
            isBuilderBusy={builderBusy}
            isPreviewBusy={previewBusy}
            isPublishing={publishing}
            statusMessage={statusMessage}
            onSelectDraft={(draftId) => {
              setSelectedDraftId(draftId);
              setPreviewMessages([]);
            }}
            onCreateDraft={handleCreateDraft}
            onBuilderSend={handleBuilderSend}
            onPreviewSend={handlePreviewSend}
            onPublish={handlePublish}
            onSavePatch={handleSavePatch}
          />
        ) : workspaceMode === "browse" ? (
          <CompanionBrowseView
            coreCompanions={catalog.coreCompanions}
            communityCompanions={catalog.communityCompanions}
            searchQuery={searchQuery}
            searchResults={searchResults}
            isSearching={isSearching}
            onSearchQueryChange={setSearchQuery}
            onOpenBuilder={() => setWorkspaceMode("build")}
          />
        ) : null}
      </main>
    </div>
  );
};

export const NewTabApp: React.FC = () => (
  <ChatProvider>
    <NewTabContent />
  </ChatProvider>
);
