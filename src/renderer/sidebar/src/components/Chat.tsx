import React, { useMemo, useState } from "react";
import { Clock3, Plus, X } from "lucide-react";
import { useChat } from "../contexts/ChatContext";
import { AssistantMessage, BlueberryMascot } from "@common/components/chat";
import { cn } from "@common/lib/utils";

function formatHistoryTimestamp(updatedAt: number): string {
  const diffMinutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

const SidebarComposer: React.FC<{
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}> = ({ disabled, onSend }) => {
  const [value, setValue] = useState("");

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    await onSend(trimmed);
    setValue("");
  };

  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="Ask a follow-up..."
        rows={1}
        className="min-h-[24px] w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/22"
      />

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/[0.06]"
        >
          <Plus className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-lime-300">Smart</div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full bg-black/20 text-white/75"
          >
            <BlueberryMascot className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            className="flex size-8 items-center justify-center rounded-full bg-lime-400 text-[#1f2d12] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus className="size-4 rotate-45" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const Chat: React.FC = () => {
  const { messages, isLoading, sendMessage, clearChat, history } = useChat();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const latestAssistant = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.trim()),
    [messages],
  );

  const latestUser = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "user" && message.content.trim()),
    [messages],
  );

  return (
    <div className="flex h-full flex-col bg-[#353433] text-[#f4f1ea]">
      <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
        <button
          type="button"
          onClick={clearChat}
          className="inline-flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2 text-xs font-medium text-white/82 transition-colors hover:bg-white/[0.08]"
        >
          <Plus className="size-3.5" />
          New chat
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHistoryOpen((value) => !value)}
            className="flex size-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85"
          >
            <Clock3 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void window.sidebarAPI.toggleSidebar()}
            className="flex size-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {isHistoryOpen && (
        <div className="border-b border-white/6 px-4 py-3">
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-2">
            <div className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/38">
              History
            </div>

            {history.length > 0 ? (
              <div className="space-y-1">
                {history.map((item) => (
                  <button
                    key={item.sessionId}
                    type="button"
                    onClick={() => {
                      setIsHistoryOpen(false);
                      void window.sidebarAPI.createChatTab(item.sessionId);
                    }}
                    className="w-full rounded-[14px] px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.045]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white/86">
                          {item.title}
                        </div>
                        {item.preview && (
                          <div className="mt-1 text-xs leading-5 text-white/42">
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
              <div className="px-2 pb-2 pt-1 text-sm text-white/45">
                No previous chats yet.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {latestAssistant ? (
          <div className="space-y-4">
            {latestUser && (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/58">
                {latestUser.content}
              </div>
            )}

            <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
              <div className="text-sm leading-6 text-white/88">
                <AssistantMessage
                  content={latestAssistant.content}
                  isStreaming={latestAssistant.isStreaming}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 opacity-25">
                <BlueberryMascot className="size-16" />
              </div>
              <div className="text-sm text-white/42">Quick asks live here.</div>
            </div>
          </div>
        )}
      </div>

      <div className={cn("border-t border-white/6 p-4", isLoading && "opacity-90")}>
        <SidebarComposer disabled={isLoading} onSend={sendMessage} />
      </div>
    </div>
  );
};
