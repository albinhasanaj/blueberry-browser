import type { ProviderMetadata, TextStreamPart, ToolSet } from "ai";
import { extractOpenAIResponseId } from "./llmRouter";

export interface StreamAggregation {
  text: string;
  reasoning: string;
  responseId: string | null;
  providerMetadata?: ProviderMetadata;
}

export function createStreamAggregator<TOOLS extends ToolSet>(options?: {
  onTextDelta?: (accumulated: string) => void;
  onReasoningDelta?: (accumulated: string) => void;
}) {
  let text = "";
  let reasoning = "";
  let responseId: string | null = null;
  let providerMetadata: ProviderMetadata | undefined;

  return {
    consume(part: TextStreamPart<TOOLS>): void {
      if (part.type === "text-delta") {
        text += part.text;
        options?.onTextDelta?.(text);
        return;
      }

      if (part.type === "reasoning-delta") {
        reasoning += part.text;
        options?.onReasoningDelta?.(reasoning);
        return;
      }

      if (part.type === "finish-step") {
        providerMetadata = part.providerMetadata;
        responseId = extractOpenAIResponseId(
          part.providerMetadata as Record<string, unknown> | undefined,
        );
      }
    },

    finalize(
      metadata?: ProviderMetadata | Record<string, unknown>,
    ): StreamAggregation {
      if (!providerMetadata && metadata && typeof metadata === "object") {
        providerMetadata = metadata as ProviderMetadata;
      }
      if (!responseId) {
        responseId = extractOpenAIResponseId(
          providerMetadata as Record<string, unknown> | undefined,
        );
      }
      return {
        text,
        reasoning,
        responseId,
        providerMetadata,
      };
    },
  };
}
