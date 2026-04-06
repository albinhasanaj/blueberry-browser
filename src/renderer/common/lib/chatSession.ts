import type { Message } from "@common/components/chat/types";

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (part): part is { type: string; text?: string } =>
        typeof part === "object" && part !== null && "type" in part,
    )
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n");
}

export function convertMessages(
  messages: unknown[],
  isLoading: boolean,
): Message[] {
  const filtered = messages.filter(
    (message): message is { role: "user" | "assistant"; content: unknown } =>
      typeof message === "object" &&
      message !== null &&
      "role" in message &&
      "content" in message &&
      (message.role === "user" || message.role === "assistant"),
  );

  return filtered.map((message, index) => {
    const isLastAssistant =
      message.role === "assistant" &&
      index === filtered.length - 1 &&
      isLoading;

    return {
      id: `msg-${index}`,
      role: message.role,
      content: extractTextContent(message.content),
      timestamp: Date.now(),
      isStreaming: isLastAssistant,
    };
  });
}

export function formatHistoryTimestamp(
  updatedAt: number,
  now: number = Date.now(),
): string {
  const diffMinutes = Math.max(0, Math.round((now - updatedAt) / 60000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
