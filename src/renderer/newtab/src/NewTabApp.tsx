import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Compass,
  Globe,
  Loader2,
  Plus,
  Square,
  Zap,
} from "lucide-react";
import { ChatProvider, useChat } from "../../sidebar/src/contexts/ChatContext";
import { AssistantMessage, BlueberryMascot } from "@common/components/chat";
import { cn } from "@common/lib/utils";
import type { AgentToolEvent, Message } from "@common/components/chat/types";

interface CompanionEvent {
  type: "companion:message" | "companion:thinking" | "companion:done";
  fromId: string;
  fromName: string;
  fromEmoji: string;
  toId?: string;
  toName?: string;
  content: string;
  timestamp: number;
  isFinal?: boolean;
  turnIndex?: number;
}

const TOOL_LABELS: Record<string, string> = {
  click: "Clicked",
  type: "Typed",
  press_key: "Pressed key",
  navigate: "Navigated to",
  read_page: "Read page",
  find: "Searched for",
  screenshot: "Took screenshot",
  javascript: "Ran script",
  open_tab: "Opened tab",
  extract: "Extracted data",
};

function formatToolSummary(toolName: string, input: Record<string, unknown>): string {
  const label = TOOL_LABELS[toolName] ?? toolName;
  switch (toolName) {
    case "navigate":
    case "open_tab":
      return `${label} ${String(input.url ?? "")}`;
    case "click":
      return input.ref != null ? `${label} element` : `${label} ${String(input.selector ?? "element")}`;
    case "type":
      return `${label} "${String(input.text ?? "")}"`;
    case "press_key":
      return `${label} ${String(input.key ?? "")}`;
    case "find":
      return `${label} elements`;
    default:
      return label;
  }
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

const COMPANION_COLORS: Record<string, string> = {
  blueberry: "border-blue-400/20 bg-blue-400/10",
  sally: "border-red-400/20 bg-red-400/10",
  camille: "border-purple-400/20 bg-purple-400/10",
  ella: "border-emerald-400/20 bg-emerald-400/10",
};

const InlineCompanionEvent: React.FC<{ event: CompanionEvent }> = ({ event }) => {
  if (event.type === "companion:thinking") {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1 text-sm text-white/30">
        <span>{event.fromEmoji}</span>
        <span className="animate-pulse">thinking…</span>
      </div>
    );
  }

  if (event.type === "companion:done") {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1 text-sm text-white/35">
        <span className="text-green-400">✓</span>
        <span>{event.fromEmoji}</span>
        <span>{event.fromName} done</span>
      </div>
    );
  }

  // companion:message
  const colorClass = COMPANION_COLORS[event.fromId] ?? "border-white/10 bg-white/[0.04]";
  return (
    <div className={cn("rounded-lg border px-3 py-2 my-1", colorClass)}>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span>{event.fromEmoji}</span>
        <span className="font-medium text-white/70">{event.fromName}</span>
        {event.toName && (
          <span className="text-white/35">→ {event.toName}</span>
        )}
      </div>
      <div className="mt-1 text-xs text-white/55 whitespace-pre-wrap">
        {event.content}
      </div>
    </div>
  );
};

const CompanionEventSection: React.FC<{ events: CompanionEvent[] }> = ({ events }) => {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) return null;

  const messageEvents = events.filter((e) => e.type === "companion:message");
  const latestOrchestrator = [...events]
    .reverse()
    .find((e) => e.type === "companion:message" && e.fromId === "blueberry");

  // Deduplicate consecutive thinking events
  const deduped: CompanionEvent[] = [];
  for (const e of events) {
    if (e.type === "companion:thinking") {
      const prev = deduped[deduped.length - 1];
      if (prev?.type === "companion:thinking" && prev.fromId === e.fromId) continue;
    }
    deduped.push(e);
  }

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-white/40 hover:bg-white/[0.03] transition-colors"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>Companion reasoning ({messageEvents.length} messages)</span>
      </button>
      {expanded ? (
        <div className="px-3 pb-3 space-y-1">
          {deduped.map((e, i) => (
            <InlineCompanionEvent key={`${e.fromId}-${e.timestamp}-${i}`} event={e} />
          ))}
        </div>
      ) : (
        latestOrchestrator && (
          <div className="px-3 pb-3">
            <InlineCompanionEvent event={latestOrchestrator} />
          </div>
        )
      )}
    </div>
  );
};

const InlineToolEvent: React.FC<{ event: AgentToolEvent }> = ({ event }) => {
  const summary = formatToolSummary(event.toolName, event.input);

  return (
    <div className="flex items-center gap-2.5 py-1 px-1 text-sm text-white/40">
      {event.status === "started" ? (
        <Loader2 className="size-3.5 animate-spin text-white/30" />
      ) : (
        <div className="size-1.5 rounded-full bg-white/25" />
      )}
      <span>{summary}</span>
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
    <div className="rounded-[24px] border border-white/7 bg-black/[0.10] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.10)]">
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
        className="min-h-[24px] w-full resize-none bg-transparent text-base leading-7 text-[#f4eee4] outline-none placeholder:text-white/22"
      />

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full text-white/78 transition-colors hover:bg-white/[0.06]"
        >
          <Plus className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 text-xs font-medium text-lime-300">
            <Zap className="size-3.5" />
            Smart
          </div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full bg-white/[0.04] text-white/78"
          >
            <BlueberryMascot className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            className="flex size-8 items-center justify-center rounded-full bg-lime-300 text-[#1c2611] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus className="size-4 rotate-45" />
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
              // Group companion events and tool events by turnIndex
              const companionsByTurn = new Map<number, CompanionEvent[]>();
              for (const e of companionEvents) {
                const turn = e.turnIndex ?? 0;
                if (!companionsByTurn.has(turn)) companionsByTurn.set(turn, []);
                companionsByTurn.get(turn)!.push(e);
              }
              const toolsByTurn = new Map<number, AgentToolEvent[]>();
              for (const e of toolEvents) {
                const turn = e.turnIndex ?? 0;
                if (!toolsByTurn.has(turn)) toolsByTurn.set(turn, []);
                toolsByTurn.get(turn)!.push(e);
              }

              let userMsgCount = 0;

              return (
                <>
                  {messages.map((message) => {
                    if (message.role === "user") {
                      const turn = userMsgCount;
                      userMsgCount++;
                      const turnCompanion = companionsByTurn.get(turn) ?? [];
                      const turnTools = toolsByTurn.get(turn) ?? [];

                      return (
                        <React.Fragment key={message.id}>
                          <UserBubble message={message} />

                          {turnCompanion.length > 0 && (
                            <CompanionEventSection events={turnCompanion} />
                          )}

                          {turnTools.length > 0 && (
                            <div className="space-y-0.5">
                              {turnTools.map((event) => (
                                <InlineToolEvent key={event.callId} event={event} />
                              ))}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    }

                    return <AssistantBlock key={message.id} message={message} />;
                  })}
                </>
              );
            })()}

            {/* Loading spinner when waiting for first response */}
            {isLoading && toolEvents.length === 0 && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 px-1 text-sm text-white/35">
                <Loader2 className="size-3.5 animate-spin" />
                Thinking...
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
