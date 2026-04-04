import type { LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import * as dotenv from "dotenv";
import { join } from "path";
import { DEFAULT_MODELS, type LLMProvider } from "./types";

// Load environment variables from .env file
// At runtime, all main-process code is bundled into out/main/index.js,
// so __dirname = out/main/ and ../../.env reaches the project root.
dotenv.config({ path: join(__dirname, "../../.env") });

export function getProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  if (provider === "anthropic") return "anthropic";
  return "openai";
}

export function getModelName(provider: LLMProvider): string {
  return process.env.LLM_MODEL || DEFAULT_MODELS[provider];
}

export function getApiKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    default:
      return undefined;
  }
}

export function createModel(
  provider: LLMProvider,
  modelName: string,
): LanguageModel | null {
  const apiKey = getApiKey(provider);
  if (!apiKey) return null;

  switch (provider) {
    case "anthropic":
      return anthropic(modelName);
    case "openai":
      return openai(modelName);
    default:
      return null;
  }
}

export function logInitializationStatus(
  provider: LLMProvider,
  modelName: string,
  model: LanguageModel | null,
): void {
  if (model) {
    console.log(
      `LLM Client initialized with ${provider} provider using model: ${modelName}`,
    );
  } else {
    const keyName =
      provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    console.error(
      `LLM Client initialization failed: ${keyName} not found in environment variables.\n` +
        `Please add your API key to the .env file in the project root.`,
    );
  }
}
