import type { CompanionDeclaration } from "../types";
import type { CompanionIdentity, OrchestrationParams } from "./types";

export function toCompanionIdentity(
  companion: CompanionDeclaration,
): CompanionIdentity {
  return {
    id: companion.id,
    name: companion.name,
    emoji: companion.emoji,
  };
}

export function emitMessage(
  params: OrchestrationParams,
  from: CompanionIdentity,
  content: string,
  to?: Pick<CompanionIdentity, "id" | "name">,
  isFinal?: boolean,
): void {
  params.onCompanionEvent({
    type: "companion:message",
    fromId: from.id,
    fromName: from.name,
    fromEmoji: from.emoji,
    toId: to?.id,
    toName: to?.name,
    content,
    timestamp: Date.now(),
    isFinal,
  });
}

export function emitDone(
  params: OrchestrationParams,
  companion: CompanionDeclaration,
  content: string,
  isFinal = false,
): void {
  params.onCompanionEvent({
    type: "companion:done",
    fromId: companion.id,
    fromName: companion.name,
    fromEmoji: companion.emoji,
    content,
    timestamp: Date.now(),
    isFinal,
  });
}

export function emitActivity(
  params: OrchestrationParams,
  companion: CompanionDeclaration,
  activity: string,
): void {
  params.onCompanionEvent({
    type: "companion:activity",
    fromId: companion.id,
    fromName: companion.name,
    fromEmoji: companion.emoji,
    content: activity,
    activity,
    timestamp: Date.now(),
  });
}
