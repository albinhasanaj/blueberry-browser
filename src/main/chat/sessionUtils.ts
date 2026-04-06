import type { ModelMessage } from "ai";
import type { ChatLatestRun } from "../agent/types";

export const DEFAULT_SESSION_TITLE = "Blueberry";

export type SessionKind = "chat" | "sidebar";

export function createEmptyLatestRun(
  taskTitle: string | null = null,
): ChatLatestRun {
  return {
    status: "idle",
    taskTitle,
    startedAt: null,
    finishedAt: null,
    stepCount: 0,
    completedStepCount: 0,
    errorCount: 0,
  };
}

export function deriveSessionTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return DEFAULT_SESSION_TITLE;
  return normalized.length > 48
    ? `${normalized.slice(0, 45).trimEnd()}...`
    : normalized;
}

export function extractMessageText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (
        part,
      ): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function stripOldScreenshots(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    if (message.role !== "user" || typeof message.content === "string") {
      return message;
    }
    if (!Array.isArray(message.content)) return message;

    const filtered = message.content.filter((part) => part.type !== "image");
    if (
      filtered.length === 1 &&
      filtered[0]?.type === "text" &&
      "text" in filtered[0] &&
      typeof filtered[0].text === "string"
    ) {
      return { role: "user", content: filtered[0].text };
    }
    if (filtered.length === 0) {
      return { role: "user", content: "" };
    }
    return { role: "user", content: filtered };
  });
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred. Please try again.";
  }

  const message = error.message.toLowerCase();
  if (message.includes("401") || message.includes("unauthorized")) {
    return "Authentication error: Please check your API key in the .env file.";
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return "Rate limit exceeded. Please try again in a few moments.";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econnrefused")
  ) {
    return "Network error: Please check your internet connection.";
  }
  if (message.includes("timeout")) {
    return "Request timeout: The service took too long to respond. Please try again.";
  }
  return "Sorry, I encountered an error while processing your request. Please try again.";
}

export function isSuccessfulToolOutput(toolOutput: string): boolean {
  return (
    !toolOutput.startsWith("Error") &&
    !toolOutput.startsWith("Failed") &&
    !toolOutput.includes("No elements found") &&
    !toolOutput.includes("is not a typeable field") &&
    !toolOutput.includes("is not clickable") &&
    !toolOutput.includes("not found or removed from page")
  );
}
