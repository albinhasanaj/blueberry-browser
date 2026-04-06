import React, { useMemo, useState } from "react";
import { cn } from "@common/lib/utils";
import type { CompanionEvent } from "@common/types/chatSession";
import {
  buildCompanionThreadItems,
  groupActivitiesByTab,
  type ThreadItem,
} from "../domain/companionThread";

const COMPANION_NAME_COLORS: Record<string, string> = {
  blueberry: "text-blue-300",
  sally: "text-rose-300",
  camille: "text-purple-300",
  ella: "text-emerald-300",
  astrid: "text-amber-300",
  archer: "text-lime-300",
};

const COMPANION_BG_COLORS: Record<string, string> = {
  blueberry: "bg-blue-400/[0.06]",
  sally: "bg-rose-400/[0.06]",
  camille: "bg-purple-400/[0.06]",
  ella: "bg-emerald-400/[0.06]",
  astrid: "bg-amber-400/[0.06]",
  archer: "bg-lime-400/[0.06]",
};

const TAB_LANE_COLORS = [
  "border-blue-500/20",
  "border-purple-500/20",
  "border-emerald-500/20",
  "border-amber-500/20",
  "border-rose-500/20",
];

const TAB_DOT_COLORS = [
  "bg-blue-400/60",
  "bg-purple-400/60",
  "bg-emerald-400/60",
  "bg-amber-400/60",
  "bg-rose-400/60",
];

function getTabLabel(label: string, fallback: string): string {
  try {
    return new URL(label).hostname;
  } catch {
    return label || fallback;
  }
}

const CollapsedThinking: React.FC<{ event: CompanionEvent }> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const nameColor = COMPANION_NAME_COLORS[event.fromId] ?? "text-white/70";
  const text = event.content.trim();

  if (!text) return null;

  return (
    <div className="py-0.5 pl-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[12px] text-white/20">
          {expanded ? "v" : ">"}
        </span>
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>
          {event.fromName}
        </span>
        <span className="text-[13px] italic text-white/20">reasoning</span>
      </button>
      {expanded && (
        <div className="mb-1 ml-7 mt-1 whitespace-pre-wrap border-l border-white/[0.06] pl-3 text-[13px] italic leading-5 text-white/25">
          {text}
        </div>
      )}
    </div>
  );
};

const CompanionThreadEvent: React.FC<{
  event: CompanionEvent;
  finished?: boolean;
}> = ({ event, finished }) => {
  const nameColor = COMPANION_NAME_COLORS[event.fromId] ?? "text-white/70";

  if (event.type === "companion:activity") {
    const tabLabel = event.tabUrl
      ? getTabLabel(event.tabUrl, event.tabId ?? "")
      : event.tabId;

    return (
      <div className="flex items-center gap-2 py-1 pl-4">
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>
          {event.fromName}
        </span>
        {tabLabel && (
          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-white/15">
            {tabLabel}
          </span>
        )}
        <span className="animate-pulse text-[13px] italic text-white/30">
          {event.activity ?? event.content}
        </span>
      </div>
    );
  }

  if (event.type === "companion:thinking") {
    if (finished) {
      return <CollapsedThinking event={event} />;
    }

    const text = event.content.trim();
    if (text) {
      return (
        <div className="py-1.5 pl-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">{event.fromEmoji}</span>
            <span className={cn("text-[13px] font-medium", nameColor)}>
              {event.fromName}
            </span>
          </div>
          <div className="ml-7 mt-1 whitespace-pre-wrap text-[13px] italic leading-5 text-white/30">
            {text}
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse align-middle bg-white/25" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 py-1.5 pl-4">
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>
          {event.fromName}
        </span>
        <span className="animate-pulse text-[13px] italic text-white/25">
          thinking...
        </span>
      </div>
    );
  }

  if (event.type === "companion:done") {
    return (
      <div className="flex items-center gap-2 py-1.5 pl-4">
        <span className="text-[13px] text-green-400/80">done</span>
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>
          {event.fromName}
        </span>
      </div>
    );
  }

  const bgColor = COMPANION_BG_COLORS[event.fromId] ?? "bg-white/[0.03]";

  return (
    <div className={cn("my-0.5 rounded-xl px-4 py-2.5", bgColor)}>
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="text-sm">{event.fromEmoji}</span>
        <span className={cn("font-semibold", nameColor)}>{event.fromName}</span>
        {event.toName && (
          <>
            <span className="text-white/20">{"->"}</span>
            <span
              className={cn(
                "font-semibold",
                COMPANION_NAME_COLORS[event.toId ?? ""] ?? "text-white/60",
              )}
            >
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

const CollapsedActivityGroup: React.FC<{
  item: Extract<ThreadItem, { kind: "activity-group" }>;
}> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const nameColor = COMPANION_NAME_COLORS[item.companionId] ?? "text-white/70";
  const tabGroups = groupActivitiesByTab(item.activities);
  const hasMultipleTabs =
    tabGroups.size > 1 || (tabGroups.size === 1 && !tabGroups.has("_default"));
  const tabEntries = Array.from(tabGroups.entries()).filter(
    ([key]) => key !== "_default",
  );

  return (
    <div className="py-0.5 pl-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[12px] text-white/20">
          {expanded ? "v" : ">"}
        </span>
        <span className="text-sm">{item.emoji}</span>
        <span className={cn("text-[13px] font-medium", nameColor)}>
          {item.name}
        </span>
        <span className="text-[13px] text-white/20">
          {item.activities.length} steps
          {hasMultipleTabs ? ` | ${tabEntries.length} tabs` : ""}
        </span>
      </button>

      {expanded &&
        (hasMultipleTabs ? (
          <div className="mb-1 ml-7 space-y-1">
            {tabGroups.has("_default") && (
              <div className="space-y-0.5 border-l border-white/[0.06] pl-3">
                {tabGroups
                  .get("_default")
                  ?.activities.map((activity, index) => (
                    <div
                      key={`general-${activity.timestamp}-${index}`}
                      className="flex items-center gap-1.5 py-0.5 text-[12px] text-white/25"
                    >
                      <span className="text-white/15">*</span>
                      <span>{activity.activity ?? activity.content}</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex gap-1.5">
              {tabEntries.map(([tabId, group], laneIndex) => (
                <div
                  key={tabId}
                  className={cn(
                    "min-w-0 flex-1 rounded-sm border-l-2 py-1 pl-2.5",
                    TAB_LANE_COLORS[laneIndex % TAB_LANE_COLORS.length],
                  )}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        TAB_DOT_COLORS[laneIndex % TAB_DOT_COLORS.length],
                      )}
                    />
                    <span className="truncate text-[11px] font-medium text-white/30">
                      {getTabLabel(group.label, tabId)}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.activities.map((activity, index) => (
                      <div
                        key={`${tabId}-${activity.timestamp}-${index}`}
                        className="truncate text-[11px] text-white/20"
                      >
                        {activity.activity ?? activity.content}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-1 ml-7 space-y-0.5 border-l border-white/[0.06] pl-3">
            {item.activities.map((activity, index) => (
              <div
                key={`${activity.timestamp}-${index}`}
                className="flex items-center gap-1.5 py-0.5 text-[12px] text-white/25"
              >
                <span className="text-white/15">*</span>
                <span>{activity.activity ?? activity.content}</span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
};

interface CompanionThreadProps {
  events: CompanionEvent[];
}

export const CompanionThread: React.FC<CompanionThreadProps> = ({ events }) => {
  const items = useMemo(() => buildCompanionThreadItems(events), [events]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-0.5 py-2">
      {items.map((item, index) => {
        if (item.kind === "activity-group") {
          return (
            <CollapsedActivityGroup
              key={`activity-group-${item.companionId}-${index}`}
              item={item}
            />
          );
        }

        return (
          <CompanionThreadEvent
            key={`${item.event.fromId}-${item.event.timestamp}-${index}`}
            event={item.event}
            finished={item.finished}
          />
        );
      })}
    </div>
  );
};
