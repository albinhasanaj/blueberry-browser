import React from "react";
import { Square } from "lucide-react";
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
}

interface AgentStepFeedProps {
  toolEvents: AgentToolEvent[];
  isLoading: boolean;
  onStop: () => void;
}

export const AgentStepFeed: React.FC<AgentStepFeedProps> = ({
  toolEvents,
  isLoading,
  onStop,
}) => {
  if (toolEvents.length === 0 && !isLoading) return null;

  const hasRunningStep = toolEvents.some((e) => e.status === "started");
  const errorCount = toolEvents.filter((e) => e.status === "error").length;

  return (
    <div className="animate-fade-in">
      {/* Step list */}
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
