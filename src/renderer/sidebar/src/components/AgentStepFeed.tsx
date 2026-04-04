import React, { useState } from "react";
import { ChevronDown, ChevronRight, Square } from "lucide-react";
import { AgentToolStep } from "./AgentToolStep";
import { cn } from "@common/lib/utils";

interface AgentToolEvent {
  toolName: string;
  input: Record<string, unknown>;
  status: "started" | "completed" | "error";
  result?: string;
  error?: string;
  stepIndex: number;
  callId: string;
  turnIndex?: number;
}

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

const COMPANION_COLORS: Record<string, { bg: string; border: string }> = {
  blueberry: {
    bg: "bg-blue-500/10 dark:bg-blue-400/10",
    border: "border-blue-500/20 dark:border-blue-400/20",
  },
  sally: {
    bg: "bg-red-500/10 dark:bg-red-400/10",
    border: "border-red-500/20 dark:border-red-400/20",
  },
  camille: {
    bg: "bg-purple-500/10 dark:bg-purple-400/10",
    border: "border-purple-500/20 dark:border-purple-400/20",
  },
  ella: {
    bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
    border: "border-emerald-500/20 dark:border-emerald-400/20",
  },
};

function getCompanionStyle(companionId: string): { bg: string; border: string } {
  return COMPANION_COLORS[companionId] ?? {
    bg: "bg-muted/30",
    border: "border-border/30",
  };
}

const CompanionMessageBubble: React.FC<{ event: CompanionEvent }> = ({ event }) => {
  const style = getCompanionStyle(event.fromId);

  return (
    <div className={cn("rounded-lg border px-3 py-2", style.bg, style.border)}>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span>{event.fromEmoji}</span>
        <span className="font-medium text-foreground/80">{event.fromName}</span>
        {event.toName && (
          <span className="text-muted-foreground">
            → {event.toName}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-foreground/70 whitespace-pre-wrap">
        {event.content}
      </div>
    </div>
  );
};

const CompanionThinking: React.FC<{ event: CompanionEvent }> = ({ event }) => (
  <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground">
    <span>{event.fromEmoji}</span>
    <span className="animate-pulse">thinking…</span>
  </div>
);

const CompanionDone: React.FC<{ event: CompanionEvent }> = ({ event }) => (
  <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground">
    <span className="text-green-500">✓</span>
    <span>{event.fromEmoji}</span>
    <span>{event.fromName} done</span>
  </div>
);

const CompanionEventItem: React.FC<{ event: CompanionEvent }> = ({ event }) => {
  switch (event.type) {
    case "companion:message":
      return <CompanionMessageBubble event={event} />;
    case "companion:thinking":
      return <CompanionThinking event={event} />;
    case "companion:done":
      return <CompanionDone event={event} />;
    default:
      return null;
  }
};

const CompanionEventsFeed: React.FC<{
  companionEvents: CompanionEvent[];
}> = ({ companionEvents }) => {
  const [expanded, setExpanded] = useState(false);

  if (companionEvents.length === 0) return null;

  // Collapse: only show the latest Blueberry message
  const latestOrchestratorMessage = [...companionEvents]
    .reverse()
    .find(
      (e) =>
        e.type === "companion:message" &&
        e.fromId === "blueberry",
    );

  // Deduplicate consecutive thinking events from the same companion
  const deduped: CompanionEvent[] = [];
  for (const event of companionEvents) {
    if (event.type === "companion:thinking") {
      const prev = deduped[deduped.length - 1];
      if (prev?.type === "companion:thinking" && prev.fromId === event.fromId) {
        continue; // skip duplicate thinking
      }
    }
    deduped.push(event);
  }

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden bg-background/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <span className="font-medium">
          Companion reasoning ({companionEvents.filter((e) => e.type === "companion:message").length} messages)
        </span>
      </button>

      {expanded ? (
        <div className="space-y-1.5 px-2.5 pb-2.5">
          {deduped.map((event, idx) => (
            <CompanionEventItem key={`${event.fromId}-${event.timestamp}-${idx}`} event={event} />
          ))}
        </div>
      ) : (
        latestOrchestratorMessage && (
          <div className="px-2.5 pb-2.5">
            <CompanionMessageBubble event={latestOrchestratorMessage} />
          </div>
        )
      )}
    </div>
  );
};

interface AgentStepFeedProps {
  toolEvents: AgentToolEvent[];
  companionEvents?: CompanionEvent[];
  isLoading: boolean;
  onStop: () => void;
}

export const AgentStepFeed: React.FC<AgentStepFeedProps> = ({
  toolEvents,
  companionEvents = [],
  isLoading,
  onStop,
}) => {
  const hasAnything =
    toolEvents.length > 0 || companionEvents.length > 0 || isLoading;
  if (!hasAnything) return null;

  const hasRunningStep = toolEvents.some((e) => e.status === "started");
  const errorCount = toolEvents.filter((e) => e.status === "error").length;

  return (
    <div className="animate-fade-in space-y-2">
      {/* Companion events */}
      <CompanionEventsFeed companionEvents={companionEvents} />

      {/* Tool step list */}
      {toolEvents.length > 0 && (
        <div className="border border-border/50 rounded-lg overflow-hidden bg-background/50">
          <div className="divide-y divide-border/30">
            {toolEvents.map((event) => (
              <AgentToolStep
                key={event.callId}
                event={event}
              />
            ))}
          </div>

          {/* Summary bar */}
          {!hasRunningStep && toolEvents.length > 1 && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground border-t border-border/30 bg-muted/20">
              {toolEvents.length} steps
              {errorCount > 0 && (
                <span className="text-red-500"> · {errorCount} failed</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stop button */}
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
  );
};
