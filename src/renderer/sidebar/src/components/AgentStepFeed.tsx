import React, { useState } from "react";
import { Check, ChevronDown, ChevronRight, Square } from "lucide-react";
import type { AgentToolEvent } from "@common/components/chat/types";
import { cn } from "@common/lib/utils";
import type { CompanionEvent } from "@common/types/chatSession";
import { AgentToolStep } from "./AgentToolStep";

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

function getCompanionStyle(companionId: string): {
  bg: string;
  border: string;
} {
  return (
    COMPANION_COLORS[companionId] ?? {
      bg: "bg-muted/30",
      border: "border-border/30",
    }
  );
}

const CompanionMessageBubble: React.FC<{ event: CompanionEvent }> = ({
  event,
}) => {
  const style = getCompanionStyle(event.fromId);

  return (
    <div className={cn("rounded-lg border px-3 py-2", style.bg, style.border)}>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span>{event.fromEmoji}</span>
        <span className="font-medium text-foreground/80">{event.fromName}</span>
        {event.toName && (
          <span className="text-muted-foreground">
            {"->"} {event.toName}
          </span>
        )}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-xs text-foreground/70">
        {event.content}
      </div>
    </div>
  );
};

const CompanionThinking: React.FC<{ event: CompanionEvent }> = ({ event }) => (
  <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground">
    <span>{event.fromEmoji}</span>
    <span className="animate-pulse">thinking...</span>
  </div>
);

const CompanionDone: React.FC<{ event: CompanionEvent }> = ({ event }) => (
  <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground">
    <Check className="size-3 text-green-500" />
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

  const latestOrchestratorMessage = [...companionEvents]
    .reverse()
    .find(
      (event) =>
        event.type === "companion:message" && event.fromId === "blueberry",
    );

  const deduped: CompanionEvent[] = [];
  for (const event of companionEvents) {
    if (event.type === "companion:thinking") {
      const previous = deduped[deduped.length - 1];
      if (
        previous?.type === "companion:thinking" &&
        previous.fromId === event.fromId
      ) {
        continue;
      }
    }
    deduped.push(event);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/40 bg-background/30">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30"
      >
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <span className="font-medium">
          Companion reasoning (
          {
            companionEvents.filter(
              (event) => event.type === "companion:message",
            ).length
          }{" "}
          messages)
        </span>
      </button>

      {expanded ? (
        <div className="space-y-1.5 px-2.5 pb-2.5">
          {deduped.map((event, index) => (
            <CompanionEventItem
              key={`${event.fromId}-${event.timestamp}-${index}`}
              event={event}
            />
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

  const hasRunningStep = toolEvents.some((event) => event.status === "started");
  const errorCount = toolEvents.filter(
    (event) => event.status === "error",
  ).length;

  return (
    <div className="animate-fade-in space-y-2">
      <CompanionEventsFeed companionEvents={companionEvents} />

      {toolEvents.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border/50 bg-background/50">
          <div className="divide-y divide-border/30">
            {toolEvents.map((event) => (
              <AgentToolStep key={event.callId} event={event} />
            ))}
          </div>

          {!hasRunningStep && toolEvents.length > 1 && (
            <div className="border-t border-border/30 bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
              {toolEvents.length} steps
              {errorCount > 0 && (
                <span className="text-red-500"> | {errorCount} failed</span>
              )}
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={onStop}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs",
              "border border-border/50 text-muted-foreground",
              "transition-colors duration-150",
              "hover:bg-muted/50 hover:text-foreground",
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
