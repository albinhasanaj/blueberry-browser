import { app } from "electron";
import { join } from "path";
import { normalizeVector } from "./searchRanking";

export interface CompanionEmbedder {
  readonly modelName: string;
  embed(text: string): Promise<number[]>;
}

type FeatureExtractionPipeline = (
  text: string,
  options?: { pooling?: "mean"; normalize?: boolean },
) => Promise<{ tolist: () => unknown }>;

export class TransformersCompanionEmbedder implements CompanionEmbedder {
  readonly modelName = "onnx-community/all-MiniLM-L6-v2-ONNX";

  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getPipeline();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    const list = output.tolist();
    const values = Array.isArray(list) && Array.isArray(list[0]) ? list[0] : list;

    if (!Array.isArray(values)) {
      throw new Error("Embedding model returned an unexpected shape.");
    }

    return normalizeVector(values.map((value) => Number(value)));
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.createPipeline();
    }
    return this.pipelinePromise;
  }

  private async createPipeline(): Promise<FeatureExtractionPipeline> {
    const { env, pipeline } = await import("@huggingface/transformers");

    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.useFSCache = true;
    env.cacheDir = join(app.getPath("userData"), "models");

    return (await pipeline(
      "feature-extraction",
      this.modelName,
    )) as FeatureExtractionPipeline;
  }
}
