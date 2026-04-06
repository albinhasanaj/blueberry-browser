import React, { type RefObject } from "react";
import { Clock3, Compass, MessageSquare, Plus } from "lucide-react";
import { BlueberryMascot } from "@common/components/chat";
import { formatHistoryTimestamp } from "@common/lib/chatSession";
import { cn } from "@common/lib/utils";
import type { ChatHistoryEntry } from "@common/types/chatSession";

const RailButton: React.FC<{
  icon: React.FC<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon: Icon, active = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex size-9 items-center justify-center rounded-xl transition-colors",
      active
        ? "bg-lime-300/[0.10] text-lime-200"
        : "text-white/68 hover:bg-white/[0.045] hover:text-white/88",
    )}
  >
    <Icon className="size-4" />
  </button>
);

const HistoryPopover: React.FC<{
  history: ChatHistoryEntry[];
  onSelect: (sessionId: string) => Promise<void>;
}> = ({ history, onSelect }) => (
  <div className="absolute left-0 top-[170px] z-20 w-[280px] rounded-[22px] border border-white/8 bg-[#302f2d] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
    <div className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-[0.16em] text-white/38">
      History
    </div>

    {history.length > 0 ? (
      <div className="space-y-1">
        {history.map((item) => (
          <button
            key={item.sessionId}
            type="button"
            onClick={() => void onSelect(item.sessionId)}
            className="w-full rounded-[16px] px-3 py-3 text-left transition-colors hover:bg-white/[0.045]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white/86">
                  {item.title}
                </div>
                {item.preview && (
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/42">
                    {item.preview}
                  </div>
                )}
              </div>
              <div className="shrink-0 pt-0.5 text-[11px] text-white/30">
                {formatHistoryTimestamp(item.updatedAt)}
              </div>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <div className="rounded-[16px] px-3 py-4 text-sm text-white/45">
        No previous chats yet.
      </div>
    )}
  </div>
);

interface NewTabSidebarProps {
  containerRef: RefObject<HTMLElement | null>;
  activeMode: "chat" | "browse" | "build";
  hasChatSession: boolean;
  history: ChatHistoryEntry[];
  isHistoryOpen: boolean;
  onShowChat: () => void;
  onShowBrowse: () => void;
  onShowBuild: () => void;
  onToggleHistory: () => void;
  onSelectHistory: (sessionId: string) => Promise<void>;
}

export const NewTabSidebar: React.FC<NewTabSidebarProps> = ({
  containerRef,
  activeMode,
  hasChatSession,
  history,
  isHistoryOpen,
  onShowChat,
  onShowBrowse,
  onShowBuild,
  onToggleHistory,
  onSelectHistory,
}) => {
  return (
    <aside
      ref={containerRef}
      className="relative flex w-[72px] shrink-0 items-start px-3 py-5"
    >
      <div className="flex flex-col items-center gap-3 rounded-[20px] bg-black/[0.08] p-2">
        <button
          type="button"
          onClick={onShowChat}
          className={cn(
            "mb-1 flex size-9 items-center justify-center rounded-xl transition-colors",
            activeMode === "chat"
              ? "bg-lime-300/[0.10] text-lime-200"
              : "text-white/68 hover:bg-white/[0.045] hover:text-white/88",
          )}
        >
          {hasChatSession ? (
            <MessageSquare className="size-4" />
          ) : (
            <BlueberryMascot className="size-5" />
          )}
        </button>
        <RailButton
          icon={Compass}
          active={activeMode === "browse"}
          onClick={onShowBrowse}
        />
        <RailButton
          icon={Plus}
          active={activeMode === "build"}
          onClick={onShowBuild}
        />
        <RailButton
          icon={Clock3}
          active={isHistoryOpen}
          onClick={onToggleHistory}
        />
      </div>

      {isHistoryOpen && (
        <HistoryPopover history={history} onSelect={onSelectHistory} />
      )}
    </aside>
  );
};
