import React, { useState } from "react";
import {
  Check,
  X,
  Loader2,
  ChevronRight,
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
      return input.ref != null ? `ref=${input.ref}` : `${input.selector || ""}`;
    case "type":
      return input.ref != null
        ? `"${input.text}" → ref=${input.ref}`
        : `"${input.text}" → ${input.selector || ""}`;
    case "navigate":
      return `${input.url}`;
    case "read_page":
      return "";
    case "find": {
      const parts: string[] = [];
      if (input.css) parts.push(`css="${input.css}"`);
      if (input.text) parts.push(`text="${input.text}"`);
      if (input.ariaLabel) parts.push(`aria="${input.ariaLabel}"`);
      if (input.role) parts.push(`role="${input.role}"`);
      if (input.placeholder) parts.push(`placeholder="${input.placeholder}"`);
      return parts.join(", ");
    }
    case "screenshot":
      return "";
    case "press_key":
      return `${input.key}`;
    case "javascript":
      return String(input.code || "").substring(0, 60);
    case "extract":
      return `${input.attribute} from ${input.selector}`;
    default:
      return JSON.stringify(input);
  }
}

const StatusIcon: React.FC<{ status: AgentToolEvent["status"] }> = ({
  status,
}) => {
  switch (status) {
    case "started":
      return <Loader2 className="size-3.5 animate-spin text-amber-500" />;
    case "completed":
      return <Check className="size-3.5 text-emerald-500" />;
    case "error":
      return <X className="size-3.5 text-red-500" />;
  }
};

export const AgentToolStep: React.FC<{ event: AgentToolEvent }> = ({
  event,
}) => {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[event.toolName] ?? {
    icon: FileText,
    label: event.toolName,
  };
  const Icon = meta.icon;
  const inputSummary = formatInput(event.toolName, event.input);
  const hasDetail = !!(event.result || event.error);

  return (
    <div className="group">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
        className={cn(
          "flex items-center gap-2 w-full text-left py-1 px-2 rounded-md text-xs",
          "transition-colors duration-100",
          hasDetail && "hover:bg-muted/50 cursor-pointer",
          !hasDetail && "cursor-default",
        )}
      >
        <StatusIcon status={event.status} />
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">{meta.label}</span>
        {inputSummary && (
          <span className="text-muted-foreground truncate flex-1">
            {inputSummary}
          </span>
        )}
        {hasDetail && (
          <ChevronRight
            className={cn(
              "size-3 text-muted-foreground transition-transform duration-150",
              "opacity-0 group-hover:opacity-100",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>

      {expanded && (
        <div className="ml-8 mt-0.5 mb-1 text-xs">
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
