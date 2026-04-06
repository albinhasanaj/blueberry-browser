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
  const activityBuffer = new Map<string, CompanionEvent[]>();
  const thinkingBuffer = new Map<string, CompanionEvent>();
  const messageBuffer = new Map<string, CompanionEvent[]>();
  const flushedCompanions = new Set<string>();
  const startedCompanions = new Set<string>();

  for (const event of events) {
    if (event.type === "companion:thinking") {
      startedCompanions.add(event.fromId);

      if (
        finishedCompanions.has(event.fromId) &&
        !flushedCompanions.has(event.fromId)
      ) {
        thinkingBuffer.set(event.fromId, event);
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
        if (!activityBuffer.has(event.fromId)) {
          activityBuffer.set(event.fromId, []);
        }

        activityBuffer.get(event.fromId)?.push(event);
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
      const bufferedActivities = activityBuffer.get(event.fromId);
      if (bufferedActivities && bufferedActivities.length > 0) {
        items.push({
          kind: "activity-group",
          companionId: event.fromId,
          emoji: event.fromEmoji,
          name: event.fromName,
          activities: bufferedActivities,
        });
        activityBuffer.delete(event.fromId);
      }

      const bufferedThinking = thinkingBuffer.get(event.fromId);
      if (bufferedThinking?.content.trim()) {
        items.push({ kind: "event", event: bufferedThinking, finished: true });
        thinkingBuffer.delete(event.fromId);
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
