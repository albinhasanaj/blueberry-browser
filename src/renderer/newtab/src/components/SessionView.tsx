import React, { useEffect, useMemo, useRef } from "react";
import { Globe, Square } from "lucide-react";
import { AssistantMessage, BlueberryMascot } from "@common/components/chat";
import type { AgentToolEvent, Message } from "@common/components/chat/types";
import type { CompanionEvent, SourcePage } from "@common/types/chatSession";
import { groupCompanionEventsByTurn } from "../domain/companionThread";
import { getFaviconUrl, getHostname } from "../domain/sessionView";
import { CompanionThread } from "./CompanionThread";
import { TaskComposer } from "./TaskComposer";

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
}

export const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({
  messages,
  isLoading,
  toolEvents,
  companionEvents,
  sendMessage,
  stopAgent,
  sourcePage,
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

              return <AssistantBlock key={message.id} message={message} />;
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
