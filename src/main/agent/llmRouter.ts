import type { JSONValue, LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import * as dotenv from "dotenv";
import { join } from "path";
import { DEFAULT_MODELS, type LLMProvider } from "./types";

dotenv.config({ path: join(__dirname, "../../.env") });

export type LLMRunScope = "chat" | "worker" | "marketplace";
export type RouteProviderOptions = Record<
  string,
  Record<string, JSONValue | undefined>
>;

export interface LLMRouteInfo {
  provider: LLMProvider;
  model: string;
}

export interface ResolvedLLMRoute extends LLMRouteInfo {
  scope: LLMRunScope;
  modelInstance: LanguageModel;
  providerOptions: RouteProviderOptions;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function getConfiguredProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (provider === "anthropic") return "anthropic";
  return "openai";
}

function getConfiguredModel(provider: LLMProvider): string {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODELS.anthropic;
    case "openai":
      return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODELS.openai;
    default:
      return DEFAULT_MODELS.openai;
  }
}

function createProviderModel(
  provider: LLMProvider,
  model: string,
): LanguageModel {
  switch (provider) {
    case "anthropic":
      getRequiredEnv("ANTHROPIC_API_KEY");
      return anthropic(model);
    case "openai":
      getRequiredEnv("OPENAI_API_KEY");
      return openai.responses(model);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

function buildProviderOptions(
  provider: LLMProvider,
  scope: LLMRunScope,
  previousOpenAIResponseId?: string | null,
): RouteProviderOptions {
  switch (provider) {
    case "anthropic":
      return {
        anthropic: {
          sendReasoning: true,
          thinking:
            scope === "marketplace"
              ? { type: "disabled" }
              : {
                  type: "enabled",
                  budgetTokens: scope === "worker" ? 1024 : 2048,
                },
        },
      };
    case "openai":
      return {
        openai: {
          reasoningEffort: scope === "worker" ? "low" : "medium",
          reasoningSummary: scope === "worker" ? "concise" : "auto",
          store: scope === "chat",
          previousResponseId:
            scope === "chat" ? previousOpenAIResponseId ?? undefined : undefined,
        },
      };
    default:
      return {};
  }
}

export function safeTemperatureForRoute(
  route: Pick<ResolvedLLMRoute, "provider" | "model" | "providerOptions">,
  value: number,
): number | undefined {
  const isOpenAIReasoningModel =
    route.provider === "openai" &&
    [/\bo[1-9]/, /gpt-5/i, /-mini/i, /-preview/i].some((pattern) =>
      pattern.test(route.model),
    );

  const anthropicThinkingType =
    route.provider === "anthropic" &&
    typeof route.providerOptions === "object" &&
    route.providerOptions !== null &&
    "anthropic" in route.providerOptions
      ? (
          route.providerOptions as {
            anthropic?: { thinking?: { type?: string } };
          }
        ).anthropic?.thinking?.type
      : undefined;

  if (isOpenAIReasoningModel) return undefined;
  if (anthropicThinkingType === "enabled" || anthropicThinkingType === "adaptive") {
    return undefined;
  }

  return value;
}

export function extractOpenAIResponseId(
  providerMetadata: RouteProviderOptions | Record<string, unknown> | undefined,
): string | null {
  if (!providerMetadata || typeof providerMetadata !== "object") {
    return null;
  }

  const openaiMetadata = (providerMetadata as { openai?: { responseId?: unknown } })
    .openai;
  return typeof openaiMetadata?.responseId === "string"
    ? openaiMetadata.responseId
    : null;
}

export class LLMRouter {
  private readonly activeProvider: LLMProvider;
  private readonly activeModel: string;

  constructor() {
    this.activeProvider = getConfiguredProvider();
    this.activeModel = getConfiguredModel(this.activeProvider);
  }

  getActiveRouteInfo(): LLMRouteInfo {
    return {
      provider: this.activeProvider,
      model: this.activeModel,
    };
  }

  resolve(
    scope: LLMRunScope,
    options?: { previousOpenAIResponseId?: string | null },
  ): ResolvedLLMRoute {
    return {
      provider: this.activeProvider,
      model: this.activeModel,
      scope,
      modelInstance: createProviderModel(this.activeProvider, this.activeModel),
      providerOptions: buildProviderOptions(
        this.activeProvider,
        scope,
        options?.previousOpenAIResponseId,
      ),
    };
  }

  logInitializationStatus(): void {
    console.log(
      `LLM router initialized with ${this.activeProvider} provider using model: ${this.activeModel}`,
    );
  }
}
