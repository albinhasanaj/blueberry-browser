import React, { useRef, useLayoutEffect, useState, useEffect } from "react";
import { Square } from "lucide-react";
import { cn } from "../../lib/utils";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import type { Message, AgentToolEvent } from "./types";

// Inline AgentToolStep to avoid deep import chains
import {
  Loader2,
  Mouse,
  Keyboard,
  Globe,
  FileText,
  Camera,
  Search,
  BookOpen,
  Code,
  CornerDownLeft,
} from "lucide-react";

// Tool metadata
const TOOL_META: Record<
  string,
  { icon: React.FC<{ className?: string }>; label: string }
> = {
  click: { icon: Mouse, label: "Click" },
  type: { icon: Keyboard, label: "Type" },
  press_key: { icon: CornerDownLeft, label: "Key" },
  navigate: { icon: Globe, label: "Navigate" },
  read_page: { icon: BookOpen, label: "Read Page" },
  find: { icon: Search, label: "Find" },
  screenshot: { icon: Camera, label: "Screenshot" },
  javascript: { icon: Code, label: "JavaScript" },
  open_tab: { icon: Globe, label: "Open Tab" },
  extract: { icon: FileText, label: "Extract" },
};

function formatInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "click":
      return input.ref != null
        ? `ref=${input.ref}`
        : `${input.selector || ""}`;
    case "type":
      return input.ref != null
        ? `"${input.text}" → ref=${input.ref}`
        : `"${input.text}" → ${input.selector || ""}`;
    case "navigate":
      return `${input.url}`;
    case "find": {
      const parts: string[] = [];
      if (input.css) parts.push(`css="${input.css}"`);
      if (input.text) parts.push(`text="${input.text}"`);
      if (input.ariaLabel) parts.push(`aria="${input.ariaLabel}"`);
      if (input.role) parts.push(`role="${input.role}"`);
      if (input.placeholder) parts.push(`placeholder="${input.placeholder}"`);
      return parts.join(", ");
    }
    case "press_key":
      return `${input.key}`;
    case "javascript":
      return String(input.code || "").substring(0, 60);
    case "read_page":
    case "screenshot":
      return "";
    default:
      return JSON.stringify(input);
  }
}

const ToolStep: React.FC<{ event: AgentToolEvent; isLast?: boolean }> = ({ event, isLast = false }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[event.toolName] ?? {
    icon: FileText,
    label: event.toolName,
  };
  const inputSummary = formatInput(event.toolName, event.input);
  const label = inputSummary ? `${meta.label} \u2013 ${inputSummary}` : meta.label;
  const hasDetail = !!(event.result || event.error);

  return (
    <div className="group relative">
      {/* Vertical connecting line */}
      {!isLast && (
        <div className="absolute left-[5px] top-[16px] bottom-[-4px] w-px bg-border/40" />
      )}

      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
        className={cn(
          "flex items-start gap-3 w-full text-left py-1.5 pl-0.5 rounded-md text-xs",
          "transition-colors duration-100",
          hasDetail && "hover:bg-muted/50 cursor-pointer",
          !hasDetail && "cursor-default",
        )}
      >
        {/* Bullet / status indicator */}
        <div className="relative z-10 mt-[5px] shrink-0">
          {event.status === "started" ? (
            <Loader2 className="size-3 animate-spin text-amber-500" />
          ) : event.status === "completed" ? (
            <div className="size-2.5 rounded-full bg-emerald-500/80" />
          ) : (
            <div className="size-2.5 rounded-full bg-red-500/80" />
          )}
        </div>

        <span className="text-muted-foreground leading-5">{label}</span>
      </button>

      {expanded && (
        <div className="ml-6 mt-0.5 mb-1 text-xs">
          {event.error && (
            <pre className="text-red-500 whitespace-pre-wrap break-words bg-red-500/5 rounded px-2 py-1">
              {event.error}
            </pre>
          )}
          {event.result && !event.error && (
            <pre className="text-muted-foreground whitespace-pre-wrap break-words bg-muted/30 rounded px-2 py-1 max-h-32 overflow-y-auto">
              {event.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

// Auto-scroll hook
const useAutoScroll = (messages: Message[]) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  useLayoutEffect(() => {
    if (messages.length > prevCount.current) {
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    }
    prevCount.current = messages.length;
  }, [messages.length]);
  return scrollRef;
};

const LoadingIndicator: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    setIsVisible(true);
  }, []);
  return (
    <div
      className={cn(
        "transition-transform duration-300 ease-in-out",
        isVisible ? "scale-100" : "scale-0",
      )}
    >
      ...
    </div>
  );
};

// -----------------------------------------------------------------------
// ConversationFeed — renders messages, tool events, and loading indicator
// -----------------------------------------------------------------------

interface ConversationFeedProps {
  messages: Message[];
  isLoading: boolean;
  toolEvents: AgentToolEvent[];
  onStop: () => void;
}

interface ConversationTurn {
  user?: Message;
  assistant?: Message;
}

export const ConversationFeed: React.FC<ConversationFeedProps> = ({
  messages,
  isLoading,
  toolEvents,
  onStop,
}) => {
  const scrollRef = useAutoScroll(messages);

  const conversationTurns: ConversationTurn[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      const turn: ConversationTurn = { user: messages[i] };
      if (messages[i + 1]?.role === "assistant") {
        turn.assistant = messages[i + 1];
        i++;
      }
      conversationTurns.push(turn);
    } else if (
      messages[i].role === "assistant" &&
      (i === 0 || messages[i - 1]?.role !== "user")
    ) {
      conversationTurns.push({ assistant: messages[i] });
    }
  }

  const showLoadingAfterLastTurn =
    isLoading && messages[messages.length - 1]?.role === "user";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="pb-4 relative">
        {conversationTurns.map((turn, index) => {
          const isLastTurn = index === conversationTurns.length - 1;
          const turnToolEvents = isLastTurn ? toolEvents : undefined;
          const turnIsLoading = showLoadingAfterLastTurn && isLastTurn;

          return (
            <div key={`turn-${index}`} className="pt-8 flex flex-col gap-6">
              {turn.user && <UserMessage content={turn.user.content} />}

              {/* Tool steps */}
              {turnToolEvents && turnToolEvents.length > 0 && (
                <div className="animate-fade-in">
                  <div className="rounded-lg overflow-hidden bg-background/50 px-2 py-1">
                    {turnToolEvents.map((event, i) => (
                      <ToolStep
                        key={event.callId}
                        event={event}
                        isLast={i === turnToolEvents.length - 1}
                      />
                    ))}
                  </div>
                  {isLoading && (
                    <div className="flex justify-center mt-2">
                      <button
                        onClick={onStop}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs",
                          "border border-border/50 text-muted-foreground",
                          "hover:bg-muted/50 hover:text-foreground",
                          "transition-colors duration-150",
                        )}
                      >
                        <Square className="size-3" />
                        Stop
                      </button>
                    </div>
                  )}
                </div>
              )}

              {turn.assistant && (
                <AssistantMessage
                  content={turn.assistant.content}
                  isStreaming={turn.assistant.isStreaming}
                />
              )}

              {turnIsLoading &&
                !turn.assistant?.content &&
                (turnToolEvents?.length ?? 0) === 0 && (
                  <div className="flex justify-start">
                    <LoadingIndicator />
                  </div>
                )}
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>
    </div>
  );
};
