import type { AgentToolEvent, Message } from "@common/components/chat/types";
import type { LatestRun } from "@common/types/chatSession";

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function getFaviconUrl(url: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return null;
  }
}

export function getVisibleMessages(messages: Message[]): Message[] {
  return messages.filter(
    (message) => message.role === "user" || message.content.trim().length > 0,
  );
}

export function hasSessionContent(
  messages: Message[],
  toolEvents: AgentToolEvent[],
  latestRun: LatestRun,
): boolean {
  return (
    messages.length > 0 || toolEvents.length > 0 || latestRun.status !== "idle"
  );
}

export function getSessionTitle(title: string | null | undefined): string {
  return title?.trim() || "Untitled";
}
