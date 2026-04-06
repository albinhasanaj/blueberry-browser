import type { CompanionEvent } from "@common/types/chatSession";

export interface ActivityTabGroup {
  label: string;
  activities: CompanionEvent[];
}

export type ThreadItem =
  | { kind: "event"; event: CompanionEvent; finished?: boolean }
  | {
      kind: "activity-group";
      companionId: string;
      emoji: string;
      name: string;
      activities: CompanionEvent[];
    };

export function groupActivitiesByTab(
  activities: CompanionEvent[],
): Map<string, ActivityTabGroup> {
  const groups = new Map<string, ActivityTabGroup>();

  for (const activity of activities) {
    const key = activity.tabId ?? "_default";

    if (!groups.has(key)) {
      groups.set(key, {
        label: activity.tabUrl ?? activity.tabId ?? "",
        activities: [],
      });
    }

    const group = groups.get(key);
    if (!group) continue;

    if (activity.tabUrl && !group.label) {
      group.label = activity.tabUrl;
    }

    group.activities.push(activity);
  }

  return groups;
}

export function groupCompanionEventsByTurn(
  events: CompanionEvent[],
): Map<number, CompanionEvent[]> {
  const eventsByTurn = new Map<number, CompanionEvent[]>();

  for (const event of events) {
    const turn = event.turnIndex ?? 0;
    const turnEvents = eventsByTurn.get(turn) ?? [];
    turnEvents.push(event);
    eventsByTurn.set(turn, turnEvents);
  }

  return eventsByTurn;
}

export function buildCompanionThreadItems(
  events: CompanionEvent[],
): ThreadItem[] {
  const finishedCompanions = new Set<string>();

  for (const event of events) {
    if (event.type === "companion:done") {
      finishedCompanions.add(event.fromId);
    }
  }

  const items: ThreadItem[] = [];
  // Ordered buffer for finished companions — preserves interleaving of
  // activity-groups and thinking blocks in chronological order.
  const finishedBuffer = new Map<string, ThreadItem[]>();
  const messageBuffer = new Map<string, CompanionEvent[]>();
  const flushedCompanions = new Set<string>();
  const startedCompanions = new Set<string>();

  function getOrCreateFinishedBuf(id: string): ThreadItem[] {
    let buf = finishedBuffer.get(id);
    if (!buf) {
      buf = [];
      finishedBuffer.set(id, buf);
    }
    return buf;
  }

  for (const event of events) {
    if (event.type === "companion:thinking") {
      startedCompanions.add(event.fromId);

      if (
        finishedCompanions.has(event.fromId) &&
        !flushedCompanions.has(event.fromId)
      ) {
        const buf = getOrCreateFinishedBuf(event.fromId);
        const last = buf[buf.length - 1];
        if (
          last?.kind === "event" &&
          last.event.type === "companion:thinking"
        ) {
          // Still in the same reasoning phase — update in place
          last.event = event;
        } else {
          // New reasoning phase (after activities or first one)
          buf.push({ kind: "event", event, finished: true });
        }
      } else {
        const lastItem = items[items.length - 1];
        if (
          lastItem?.kind === "event" &&
          lastItem.event.type === "companion:thinking" &&
          lastItem.event.fromId === event.fromId
        ) {
          lastItem.event = event;
          continue;
        }

        items.push({ kind: "event", event });
      }

      continue;
    }

    if (event.type === "companion:activity") {
      startedCompanions.add(event.fromId);

      if (finishedCompanions.has(event.fromId)) {
        const buf = getOrCreateFinishedBuf(event.fromId);
        const last = buf[buf.length - 1];
        if (last?.kind === "activity-group" && last.companionId === event.fromId) {
          // Append to existing activity group
          last.activities.push(event);
        } else {
          // Start a new activity group
          buf.push({
            kind: "activity-group",
            companionId: event.fromId,
            emoji: event.fromEmoji,
            name: event.fromName,
            activities: [event],
          });
        }
      } else {
        const tabKey = event.tabId ?? "_default";
        const existingIndex = items.findIndex(
          (item) =>
            item.kind === "event" &&
            item.event.type === "companion:activity" &&
            item.event.fromId === event.fromId &&
            (item.event.tabId ?? "_default") === tabKey,
        );

        if (existingIndex !== -1) {
          (
            items[existingIndex] as Extract<ThreadItem, { kind: "event" }>
          ).event = event;
        } else {
          items.push({ kind: "event", event });
        }
      }

      continue;
    }

    if (event.type === "companion:done") {
      const buf = finishedBuffer.get(event.fromId);
      if (buf) {
        for (const buffered of buf) {
          // Skip empty reasoning blocks
          if (
            buffered.kind === "event" &&
            buffered.event.type === "companion:thinking" &&
            !buffered.event.content.trim()
          ) {
            continue;
          }
          items.push(buffered);
        }
        finishedBuffer.delete(event.fromId);
      }

      items.push({ kind: "event", event });
      flushedCompanions.add(event.fromId);

      const deferredMessages = messageBuffer.get(event.fromId);
      if (deferredMessages) {
        for (const deferredMessage of deferredMessages) {
          items.push({ kind: "event", event: deferredMessage });
        }
        messageBuffer.delete(event.fromId);
      }

      continue;
    }

    if (
      event.toId &&
      startedCompanions.has(event.fromId) &&
      !flushedCompanions.has(event.fromId)
    ) {
      if (!messageBuffer.has(event.fromId)) {
        messageBuffer.set(event.fromId, []);
      }

      messageBuffer.get(event.fromId)?.push(event);
    } else {
      items.push({ kind: "event", event });
    }
  }

  return items;
}
