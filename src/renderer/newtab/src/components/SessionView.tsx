import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Globe, Loader2, Square } from "lucide-react";
import { AssistantMessage, BlueberryMascot } from "@common/components/chat";
import type { AgentToolEvent, Message } from "@common/components/chat/types";
import type { CompanionEvent, SourcePage } from "@common/types/chatSession";
import { groupCompanionEventsByTurn } from "../domain/companionThread";
import { getFaviconUrl, getHostname } from "../domain/sessionView";
import { CompanionThread } from "./CompanionThread";
import { TaskComposer } from "./TaskComposer";

const COMPANION_SPEC_RE = /<!-- companion-spec (.*?) -->/s;

function extractCompanionSpec(
  content: string,
): { cleanContent: string; spec: Record<string, unknown> } | null {
  const match = COMPANION_SPEC_RE.exec(content);
  if (!match) return null;
  try {
    const spec = JSON.parse(match[1]) as Record<string, unknown>;
    const cleanContent = content.replace(match[0], "").trimEnd();
    return { cleanContent, spec };
  } catch {
    return null;
  }
}

const BuildCompanionButton: React.FC<{
  spec: Record<string, unknown>;
  onBuild: (spec: Record<string, unknown>) => Promise<void>;
}> = ({ spec, onBuild }) => {
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState(false);

  const handleClick = async (): Promise<void> => {
    if (busy || built) return;
    setBusy(true);
    try {
      await onBuild(spec);
      setBuilt(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy || built}
      className="mt-4 flex items-center gap-2.5 rounded-xl border border-lime-300/20 bg-lime-300/[0.08] px-4 py-2.5 text-sm font-medium text-lime-300 transition-all hover:bg-lime-300/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Building companion...
        </>
      ) : built ? (
        <>
          <Bot className="size-4" />
          Companion published
        </>
      ) : (
        <>
          <Bot className="size-4" />
          Build companion
        </>
      )}
    </button>
  );
};

const SourcePageCard: React.FC<{ sourcePage: SourcePage }> = ({
  sourcePage,
}) => {
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
        <div className="truncate text-xs text-cyan-200/68">
          {getHostname(sourcePage.url)}
        </div>
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

const AssistantBlock: React.FC<{
  message: Message;
  onBuildCompanionFromSpec?: (spec: Record<string, unknown>) => Promise<void>;
}> = ({ message, onBuildCompanionFromSpec }) => {
  if (!message.content.trim() && !message.isStreaming) return null;

  const parsed = message.isStreaming
    ? null
    : extractCompanionSpec(message.content);

  return (
    <div className="px-1 text-[15px] leading-7 text-[#f3efe7]">
      <AssistantMessage
        content={parsed ? parsed.cleanContent : message.content}
        isStreaming={message.isStreaming}
      />
      {parsed && onBuildCompanionFromSpec && (
        <BuildCompanionButton
          spec={parsed.spec}
          onBuild={onBuildCompanionFromSpec}
        />
      )}
    </div>
  );
};

interface EmptyStateProps {
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  title: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  sendMessage,
  isLoading,
  title,
}) => (
  <div className="flex h-full flex-col items-center justify-center px-6">
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

interface ActiveSessionViewProps {
  messages: Message[];
  isLoading: boolean;
  toolEvents: AgentToolEvent[];
  companionEvents: CompanionEvent[];
  sendMessage: (message: string) => Promise<void>;
  stopAgent: () => void;
  sourcePage: SourcePage | null;
  onBuildCompanionFromSpec?: (spec: Record<string, unknown>) => Promise<void>;
}

export const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({
  messages,
  isLoading,
  toolEvents,
  companionEvents,
  sendMessage,
  stopAgent,
  sourcePage,
  onBuildCompanionFromSpec,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const companionEventsByTurn = useMemo(
    () => groupCompanionEventsByTurn(companionEvents),
    [companionEvents],
  );

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [companionEvents.length, messages.length, toolEvents.length]);

  let userMessageCount = 0;
  const showIdleLoadingIndicator =
    isLoading &&
    toolEvents.length === 0 &&
    companionEvents.length === 0 &&
    messages[messages.length - 1]?.role === "user";

  return (
    <>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col px-6 pb-44 pt-10">
          <div className="mt-10 space-y-5">
            {sourcePage && (
              <div className="flex justify-end">
                <SourcePageCard sourcePage={sourcePage} />
              </div>
            )}

            {messages.map((message) => {
              if (message.role === "user") {
                const turn = userMessageCount;
                userMessageCount += 1;
                const turnCompanionEvents =
                  companionEventsByTurn.get(turn) ?? [];

                return (
                  <React.Fragment key={message.id}>
                    <UserBubble message={message} />
                    {turnCompanionEvents.length > 0 && (
                      <CompanionThread events={turnCompanionEvents} />
                    )}
                  </React.Fragment>
                );
              }

              return (
                <AssistantBlock
                  key={message.id}
                  message={message}
                  onBuildCompanionFromSpec={onBuildCompanionFromSpec}
                />
              );
            })}

            {showIdleLoadingIndicator && (
              <div className="flex items-center gap-2 py-1.5 pl-4">
                <BlueberryMascot className="size-4.5" />
                <span className="text-[13px] font-semibold text-blue-300">
                  Blueberry
                </span>
                <span className="animate-pulse text-[13px] italic text-white/25">
                  thinking...
                </span>
              </div>
            )}

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
