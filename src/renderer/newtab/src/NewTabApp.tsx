import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Clock3,
  Compass,
  Globe,
  Plus,
  Square,
} from "lucide-react";
import { ChatProvider, useChat } from "../../sidebar/src/contexts/ChatContext";
import { AssistantMessage, BlueberryMascot } from "@common/components/chat";
import { cn } from "@common/lib/utils";
import type { AgentToolEvent, Message } from "@common/components/chat/types";

interface CompanionEvent {
  type: "companion:message" | "companion:thinking" | "companion:done" | "companion:activity";
  fromId: string;
  fromName: string;
  fromEmoji: string;
  toId?: string;
  toName?: string;
  content: string;
  timestamp: number;
  isFinal?: boolean;
  turnIndex?: number;
  activity?: string;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return null;
  }
}

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

const HeaderPill: React.FC = () => (
  <div className="inline-flex items-center gap-3 rounded-2xl bg-black/[0.08] px-4 py-3 text-white/70">
    <BlueberryMascot className="size-4.5" />
    <BlueberryMascot className="size-4.5" />
    <Plus className="size-4" />
  </div>
);

function formatHistoryTimestamp(updatedAt: number): string {
  const diffMinutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

const HistoryPopover: React.FC<{
  history: ReturnType<typeof useChat>["history"];
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

const SourcePageCard: React.FC<{
  sourcePage: NonNullable<ReturnType<typeof useChat>["sourcePage"]>;
}> = ({ sourcePage }) => {
  const faviconUrl = getFaviconUrl(sourcePage.url);

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-white/7 bg-black/[0.10] px-3 py-2">
      <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.04]">
        {faviconUrl ? (
          <img src={faviconUrl} alt="" className="size-4.5 object-contain" />
        ) : (
          <Globe className="size-4 text-white/55" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white/90">
          {sourcePage.title || getHostname(sourcePage.url)}
        </div>
        <div className="truncate text-xs text-cyan-200/68">{getHostname(sourcePage.url)}</div>
      </div>
    </div>
  );
};

const UserBubble: React.FC<{ message: Message }> = ({ message }) => (
  <div className="flex justify-end">
    <div className="max-w-[76%] rounded-[28px] bg-black/[0.10] px-5 py-4 text-[15px] leading-7 text-[#f4eee2]">
      <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
    </div>
  </div>
);

const AssistantBlock: React.FC<{ message: Message }> = ({ message }) => {
  if (!message.content.trim() && !message.isStreaming) return null;

  return (
    <div className="px-1 text-[15px] leading-7 text-[#f3efe7]">
      <AssistantMessage
        content={message.content}
        isStreaming={message.isStreaming}
      />
    </div>
  );
};

const COMPANION_NAME_COLORS: Record<string, string> = {
  blueberry: "text-blue-300",
  sally: "text-rose-300",
  camille: "text-purple-300",
  ella: "text-emerald-300",
  astrid: "text-amber-300",
};

const COMPANION_BG_COLORS: Record<string, string> = {
  blueberry: "bg-blue-400/[0.06]",
  sally: "bg-rose-400/[0.06]",
  camille: "bg-purple-400/[0.06]",
  ella: "bg-emerald-400/[0.06]",
  astrid: "bg-amber-400/[0.06]",
};

const CollapsedThinking: React.FC<{ event: CompanionEvent }> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const nameColor = COMPANION_NAME_COLORS[event.fromId] ?? "text-white/70";
  const text = event.content?.trim();

  if (!text) return null;

  return (
    <div className="py-0.5 pl-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-left transition-colors hover:bg-white/[0.03] rounded-lg px-1 -mx-1 py-1"
      >
        <span className="text-[12px] text-white/20">{expanded ? "▾" : "▸"}</span>
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>{event.fromName}</span>
        <span className="text-[13px] text-white/20 italic">thought</span>
      </button>
      {expanded && (
        <div className="mt-1 ml-7 text-[13px] leading-5 text-white/25 italic whitespace-pre-wrap border-l border-white/[0.06] pl-3 mb-1">
          {text}
        </div>
      )}
    </div>
  );
};

const CompanionThreadEvent: React.FC<{ event: CompanionEvent; finished?: boolean }> = ({ event, finished }) => {
  const nameColor = COMPANION_NAME_COLORS[event.fromId] ?? "text-white/70";

  if (event.type === "companion:activity") {
    // Live activity — pulsing
    return (
      <div className="flex items-center gap-2 py-1 pl-4">
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>{event.fromName}</span>
        <span className="text-[13px] italic text-white/30 animate-pulse">{event.activity ?? event.content}</span>
      </div>
    );
  }

  if (event.type === "companion:thinking") {
    // Finished thinking → show collapsible block
    if (finished) {
      return <CollapsedThinking event={event} />;
    }

    const text = event.content?.trim();
    // Streaming thinking → show live text with cursor
    if (text) {
      return (
        <div className="py-1.5 pl-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">{event.fromEmoji}</span>
            <span className={cn("text-[13px] font-medium", nameColor)}>{event.fromName}</span>
          </div>
          <div className="mt-1 ml-7 text-[13px] leading-5 text-white/30 italic whitespace-pre-wrap">
            {text}
            <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-white/25 animate-pulse align-middle" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 py-1.5 pl-4">
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>{event.fromName}</span>
        <span className="text-[13px] italic text-white/25 animate-pulse">thinking...</span>
      </div>
    );
  }

  if (event.type === "companion:done") {
    return (
      <div className="flex items-center gap-2 py-1.5 pl-4">
        <span className="text-[13px] text-green-400/80">✓</span>
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>{event.fromName}</span>
        <span className="text-[13px] text-white/30">done</span>
      </div>
    );
  }

  // companion:message — the main conversation line
  const bgColor = COMPANION_BG_COLORS[event.fromId] ?? "bg-white/[0.03]";
  const isOrchestratorMessage = event.toName;

  return (
    <div className={cn("rounded-xl py-2.5 px-4 my-0.5", bgColor)}>
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("font-semibold", nameColor)}>{event.fromName}</span>
        {isOrchestratorMessage && (
          <>
            <span className="text-white/20">→</span>
            <span className={cn("font-semibold", COMPANION_NAME_COLORS[event.toId ?? ""] ?? "text-white/60")}>
              {event.toName}
            </span>
          </>
        )}
      </div>
      <div className="mt-1 text-[13px] leading-5 text-white/55">
        {event.content}
      </div>
    </div>
  );
};

type ThreadItem =
  | { kind: "event"; event: CompanionEvent; finished?: boolean }
  | { kind: "activity-group"; companionId: string; emoji: string; name: string; activities: CompanionEvent[] };

const CollapsedActivityGroup: React.FC<{ item: Extract<ThreadItem, { kind: "activity-group" }> }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const nameColor = COMPANION_NAME_COLORS[item.companionId] ?? "text-white/70";

  return (
    <div className="py-0.5 pl-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-left transition-colors hover:bg-white/[0.03] rounded-lg px-1 -mx-1 py-1"
      >
        <span className="text-[12px] text-white/20">{expanded ? "▾" : "▸"}</span>
        <span className="text-sm">{item.emoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>{item.name}</span>
        <span className="text-[13px] text-white/20">{item.activities.length} steps</span>
      </button>
      {expanded && (
        <div className="ml-7 border-l border-white/[0.06] pl-3 mb-1 space-y-0.5">
          {item.activities.map((a, i) => (
            <div key={`${a.timestamp}-${i}`} className="flex items-center gap-1.5 py-0.5 text-[12px] text-white/25">
              <span className="text-white/15">•</span>
              <span>{a.activity ?? a.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CompanionThread: React.FC<{ events: CompanionEvent[] }> = ({ events }) => {
  if (events.length === 0) return null;

  // Track which companions have finished (received companion:done)
  const finishedCompanions = new Set<string>();
  for (const e of events) {
    if (e.type === "companion:done") finishedCompanions.add(e.fromId);
  }

  // Build render items:
  // - Consecutive thinking from same companion → keep latest
  // - Activity events from finished companions → group into collapsible block
  // - Activity events from live companions → show latest only (live pulsing)
  // - Result messages from finished companions → defer until after done
  // - When done arrives, keep any preceding thinking with content
  const items: ThreadItem[] = [];

  // Collect all activities per companion for finished ones
  const activityBuffer = new Map<string, CompanionEvent[]>();
  // Buffer thinking events from finished companions so they render after steps
  const thinkingBuffer = new Map<string, CompanionEvent>();
  // Buffer result messages (companion:message with toId) from finished companions
  const messageBuffer = new Map<string, CompanionEvent[]>();
  // Track which companions have already been flushed (done event processed)
  const flushedCompanions = new Set<string>();
  // Track which companions have started working (received thinking/activity)
  const startedCompanions = new Set<string>();

  for (const e of events) {
    if (e.type === "companion:thinking") {
      startedCompanions.add(e.fromId);
      if (finishedCompanions.has(e.fromId) && !flushedCompanions.has(e.fromId)) {
        // Buffer thinking for finished companions — will flush after activity group
        thinkingBuffer.set(e.fromId, e);
      } else {
        // Live companion or already flushed — render inline, collapse consecutive
        const lastItem = items[items.length - 1];
        if (lastItem?.kind === "event" && lastItem.event.type === "companion:thinking" && lastItem.event.fromId === e.fromId) {
          lastItem.event = e;
          continue;
        }
        items.push({ kind: "event", event: e });
      }
      continue;
    }

    if (e.type === "companion:activity") {
      startedCompanions.add(e.fromId);
      if (finishedCompanions.has(e.fromId)) {
        // Accumulate for grouping
        if (!activityBuffer.has(e.fromId)) activityBuffer.set(e.fromId, []);
        activityBuffer.get(e.fromId)!.push(e);
      } else {
        // Live companion — collapse to latest
        const lastItem = items[items.length - 1];
        if (lastItem?.kind === "event" && lastItem.event.type === "companion:activity" && lastItem.event.fromId === e.fromId) {
          lastItem.event = e;
        } else {
          items.push({ kind: "event", event: e });
        }
      }
      continue;
    }

    if (e.type === "companion:done") {
      // Flush activity buffer as a grouped block
      const buffered = activityBuffer.get(e.fromId);
      if (buffered && buffered.length > 0) {
        items.push({
          kind: "activity-group",
          companionId: e.fromId,
          emoji: e.fromEmoji,
          name: e.fromName,
          activities: buffered,
        });
        activityBuffer.delete(e.fromId);
      }

      // Flush buffered thinking (final reasoning) after steps
      const bufferedThinking = thinkingBuffer.get(e.fromId);
      if (bufferedThinking && bufferedThinking.content?.trim()) {
        items.push({ kind: "event", event: bufferedThinking, finished: true });
        thinkingBuffer.delete(e.fromId);
      }

      items.push({ kind: "event", event: e });
      flushedCompanions.add(e.fromId);

      // Flush any deferred result messages from this companion after done
      const deferredMsgs = messageBuffer.get(e.fromId);
      if (deferredMsgs) {
        for (const msg of deferredMsgs) {
          items.push({ kind: "event", event: msg });
        }
        messageBuffer.delete(e.fromId);
      }
      continue;
    }

    // companion:message — defer result messages from companions that have
    // started working but haven't finished yet, so they appear after done
    if (e.toId && startedCompanions.has(e.fromId) && !flushedCompanions.has(e.fromId)) {
      if (!messageBuffer.has(e.fromId)) messageBuffer.set(e.fromId, []);
      messageBuffer.get(e.fromId)!.push(e);
    } else {
      items.push({ kind: "event", event: e });
    }
  }

  return (
    <div className="space-y-0.5 py-2">
      {items.map((item, i) => {
        if (item.kind === "activity-group") {
          return <CollapsedActivityGroup key={`ag-${item.companionId}-${i}`} item={item} />;
        }
        return (
          <CompanionThreadEvent
            key={`${item.event.fromId}-${item.event.timestamp}-${i}`}
            event={item.event}
            finished={item.finished}
          />
        );
      })}
    </div>
  );
};

const TaskComposer: React.FC<{
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
  placeholder: string;
}> = ({ disabled, onSend, placeholder }) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      140,
    )}px`;
  }, [value]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    await onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
    }
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-[#2a2928] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="min-h-[24px] w-full resize-none bg-transparent text-base leading-7 text-[#f4eee4] outline-none placeholder:text-white/40"
      />

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full text-white/78 transition-colors hover:bg-white/[0.06]"
        >
          <Plus className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          {/* <div className="inline-flex items-center gap-1 text-xs font-medium text-lime-300">
            <Zap className="size-3.5" />
            Smart
          </div> */}
          {/* <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full bg-white/[0.04] text-white/78"
          >
            <BlueberryMascot className="size-4.5" />
          </button> */}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            className="flex size-8 items-center justify-center rounded-full bg-lime-300 text-[#1c2611] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  title: string;
}> = ({ sendMessage, isLoading, title }) => (
  <div className="flex h-full flex-col items-center justify-center px-6">
    <HeaderPill />

    <div className="mt-24 flex flex-col items-center">
      <BlueberryMascot className="size-16" />
      <div className="mt-4 text-sm text-white/55">{title}</div>
    </div>

    <div className="mt-8 w-full max-w-[520px]">
      <TaskComposer
        disabled={isLoading}
        onSend={sendMessage}
        placeholder={`Chat with ${title}...`}
      />
    </div>
  </div>
);

const ActiveSessionView: React.FC<{
  messages: Message[];
  isLoading: boolean;
  toolEvents: AgentToolEvent[];
  companionEvents: CompanionEvent[];
  sendMessage: (message: string) => Promise<void>;
  stopAgent: () => void;
  sourcePage: ReturnType<typeof useChat>["sourcePage"];
  latestRun: ReturnType<typeof useChat>["latestRun"];
}> = ({
  messages,
  isLoading,
  toolEvents,
  companionEvents,
  sendMessage,
  stopAgent,
  sourcePage,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, toolEvents.length, companionEvents.length]);

  return (
    <>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col px-6 pb-44 pt-10">
          <div className="flex justify-center">
            <HeaderPill />
          </div>

          <div className="mt-10 space-y-5">
            {sourcePage && (
              <div className="flex justify-end">
                <SourcePageCard sourcePage={sourcePage} />
              </div>
            )}

            {(() => {
              // Group companion events by turnIndex
              const companionsByTurn = new Map<number, CompanionEvent[]>();
              for (const e of companionEvents) {
                const turn = e.turnIndex ?? 0;
                if (!companionsByTurn.has(turn)) companionsByTurn.set(turn, []);
                companionsByTurn.get(turn)!.push(e);
              }

              let userMsgCount = 0;

              return (
                <>
                  {messages.map((message) => {
                    if (message.role === "user") {
                      const turn = userMsgCount;
                      userMsgCount++;
                      const turnCompanion = companionsByTurn.get(turn) ?? [];

                      return (
                        <React.Fragment key={message.id}>
                          <UserBubble message={message} />

                          {turnCompanion.length > 0 && (
                            <CompanionThread events={turnCompanion} />
                          )}
                        </React.Fragment>
                      );
                    }

                    return <AssistantBlock key={message.id} message={message} />;
                  })}
                </>
              );
            })()}

            {/* Loading indicator when waiting */}
            {isLoading && toolEvents.length === 0 && companionEvents.length === 0 && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 py-1.5 pl-4">
                <span className="text-sm">🫐</span>
                <span className="text-[13px] font-semibold text-blue-300">Blueberry</span>
                <span className="text-[13px] italic text-white/25 animate-pulse">thinking...</span>
              </div>
            )}

            {/* Stop button */}
            {isLoading && (
              <div>
                <button
                  type="button"
                  onClick={stopAgent}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  <Square className="size-3" />
                  Stop
                </button>
              </div>
            )}
          </div>
          <div ref={scrollRef} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-12">
        <div className="mx-auto max-w-[520px]">
          <TaskComposer
            disabled={isLoading}
            onSend={sendMessage}
            placeholder="Ask a follow-up..."
          />
        </div>
      </div>
    </>
  );
};

const NewTabContent: React.FC = () => {
  const {
    messages,
    isLoading,
    toolEvents,
    companionEvents,
    sendMessage,
    stopAgent,
    sourcePage,
    latestRun,
    sessionTitle,
    history,
    openSession,
  } = useChat();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    if (!isHistoryOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!historyRef.current) return;
      if (historyRef.current.contains(event.target as Node)) return;
      setIsHistoryOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isHistoryOpen]);

  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (message) => message.role === "user" || message.content.trim().length > 0,
      ),
    [messages],
  );

  const hasSessionContent =
    visibleMessages.length > 0 ||
    toolEvents.length > 0 ||
    latestRun.status !== "idle";
  const title = sessionTitle?.trim() || "Untitled";

  const handleHistorySelect = async (selectedSessionId: string) => {
    await openSession(selectedSessionId);
    setIsHistoryOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#343332] text-[#f5f1e9]">
      <aside
        ref={historyRef}
        className="relative flex w-[72px] shrink-0 items-start px-3 py-5"
      >
        <div className="flex flex-col items-center gap-3 rounded-[20px] bg-black/[0.08] p-2">
          <div className="mb-1">
            <BlueberryMascot className="size-5" />
          </div>
          <RailButton icon={Compass} active />
          <RailButton
            icon={Plus}
            onClick={() => void window.sidebarAPI.createChatTab()}
          />
          <RailButton
            icon={Clock3}
            active={isHistoryOpen}
            onClick={() => setIsHistoryOpen((value) => !value)}
          />
        </div>

        {isHistoryOpen && (
          <HistoryPopover
            history={history}
            onSelect={handleHistorySelect}
          />
        )}
      </aside>

      <main className="relative flex-1 overflow-hidden">
        {hasSessionContent ? (
          <ActiveSessionView
            messages={visibleMessages}
            isLoading={isLoading}
            toolEvents={toolEvents}
            companionEvents={companionEvents}
            sendMessage={sendMessage}
            stopAgent={stopAgent}
            sourcePage={sourcePage}
            latestRun={latestRun}
          />
        ) : (
          <EmptyState
            sendMessage={sendMessage}
            isLoading={isLoading}
            title={title}
          />
        )}
      </main>
    </div>
  );
};

export const NewTabApp: React.FC = () => {
  return (
    <ChatProvider>
      <NewTabContent />
    </ChatProvider>
  );
};
