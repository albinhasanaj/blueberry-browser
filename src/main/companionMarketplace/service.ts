import {
  generateObject,
  generateText,
  type CoreMessage,
} from "ai";
import { z } from "zod";
import type {
  BuilderAssistantResult,
  BuilderMessage,
  BuilderPatch,
  CatalogCompanion,
  CompanionCatalogSnapshot,
  CompanionDraft,
  CompanionPreviewRequest,
  CompanionPreviewResult,
  CompanionSearchResult,
  PublishedCompanion,
} from "../../shared/companionMarketplace";
import { createModel, getModelName, getProvider } from "../agent/modelProvider";
import { getAllCompanions } from "../agent/companions/registry";
import { loadPrompt } from "../agent/prompts/loadPrompt";
import {
  applyBuilderPatch,
  builderPatchSchema,
  createEmptyDraft,
  validateDraftForPublish,
} from "./draftUtils";
import { TransformersCompanionEmbedder, type CompanionEmbedder } from "./embedder";
import { getCoreCatalogCompanions } from "./core";
import type { CompanionRepository } from "./repository";
import { SqliteCompanionRepository } from "./repository";
import {
  blendSearchScores,
  buildMatchReason,
  dotProduct,
  normalizeVector,
  sortSearchResults,
} from "./searchRanking";
import { buildCoreRoster, buildEmbeddingText } from "./runtime";
import { composeMarketplacePrompt } from "./promptComposer";

const builderResultSchema = z.object({
  reply: z.string(),
  patch: builderPatchSchema,
});

function createCommunityCompanionId(): string {
  return `community-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toCoreMessages(messages: BuilderMessage[]): CoreMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function getBuilderContext(draft: CompanionDraft): string {
  return JSON.stringify(
    {
      name: draft.name,
      description: draft.description,
      instructions: draft.instructions,
      bestFor: draft.bestFor,
      tags: draft.tags,
      conversationStarters: draft.conversationStarters,
      temperature: draft.temperature,
      maxSteps: draft.maxSteps,
      toolProfile: draft.toolProfile,
      tools: draft.tools,
    },
    null,
    2,
  );
}

function toPublishedCompanion(draft: CompanionDraft, nowIso: string): PublishedCompanion {
  return {
    ...draft,
    status: "published",
    publishedAt: nowIso,
    updatedAt: nowIso,
    lastError: null,
  };
}

function assertDraft(
  companion: CatalogCompanion | null,
  companionId: string,
): CompanionDraft {
  if (!companion || companion.status === "published") {
    throw new Error(`Draft "${companionId}" not found.`);
  }

  return companion;
}

function keywordRankToScore(rank: number): number {
  const safeRank = Number.isFinite(rank) ? Math.max(rank, 0) : 999;
  return 1 / (1 + safeRank);
}

export class CompanionMarketplaceService {
  constructor(
    private readonly repository: CompanionRepository = new SqliteCompanionRepository(),
    private readonly embedder: CompanionEmbedder = new TransformersCompanionEmbedder(),
  ) {}

  async listCompanions(): Promise<CompanionCatalogSnapshot> {
    return {
      coreCompanions: getCoreCatalogCompanions(),
      communityCompanions: this.repository.listPublishedCompanions(),
      drafts: this.repository.listDrafts(),
    };
  }

  async searchCompanions(query: string): Promise<CompanionSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const published = this.repository.listPublishedCompanions();
    const keywordRows = this.repository.keywordSearchPublished(trimmed, 20);
    const keywordScores = new Map<string, number>();
    for (const row of keywordRows) {
      keywordScores.set(row.id, keywordRankToScore(row.rank));
    }

    let semanticScores = new Map<string, number>();
    try {
      const queryEmbedding = normalizeVector(await this.embedder.embed(trimmed));
      const embeddingRows = this.repository.getAllPublishedEmbeddings();
      semanticScores = new Map(
        embeddingRows.map((row) => [
          row.companionId,
          Math.max(0, dotProduct(queryEmbedding, normalizeVector(row.vector))),
        ]),
      );
    } catch (error) {
      console.warn(
        `[companions] semantic search unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const results = published
      .map((companion) => {
        const keywordScore = keywordScores.get(companion.id) ?? 0;
        const semanticScore = semanticScores.get(companion.id) ?? 0;
        const score = blendSearchScores(keywordScore, semanticScore);
        if (score <= 0) return null;

        return {
          companion,
          score,
          keywordScore,
          semanticScore,
          matchReason: buildMatchReason(
            keywordScore,
            semanticScore,
            companion.tags.some((tag) =>
              trimmed.toLowerCase().includes(tag.toLowerCase()),
            )
              ? `Tag match: ${companion.tags.join(", ")}`
              : undefined,
          ),
        } satisfies CompanionSearchResult;
      })
      .filter((result): result is CompanionSearchResult => result !== null);

    return sortSearchResults(results).slice(0, 12);
  }

  async getCompanion(id: string): Promise<CatalogCompanion | null> {
    return (
      getCoreCatalogCompanions().find((companion) => companion.id === id) ??
      this.repository.getCommunityCompanion(id)
    );
  }

  async createDraftCompanion(): Promise<CompanionDraft> {
    const nowIso = new Date().toISOString();
    const draft = createEmptyDraft(createCommunityCompanionId(), nowIso);
    return this.repository.saveCompanion(draft) as CompanionDraft;
  }

  async updateDraftCompanion(
    companionId: string,
    patch: BuilderPatch,
  ): Promise<CompanionDraft> {
    const draft = assertDraft(
      this.repository.getCommunityCompanion(companionId),
      companionId,
    );

    const updated = applyBuilderPatch(draft, patch, new Date().toISOString());
    return this.repository.saveCompanion(updated) as CompanionDraft;
  }

  async chatCompanionBuilder(
    companionId: string,
    message: string,
  ): Promise<BuilderAssistantResult> {
    const draft = assertDraft(
      this.repository.getCommunityCompanion(companionId),
      companionId,
    );
    const model = this.requireModel();

    const history = toCoreMessages(draft.builderMessages);
    const result = await generateObject({
      model,
      schema: builderResultSchema,
      temperature: 0.3,
      system: loadPrompt("builder/system"),
      messages: [
        {
          role: "user",
          content: `Current draft:\n${getBuilderContext(draft)}`,
        },
        ...history,
        { role: "user", content: message.trim() },
      ],
    });

    const patch = result.object.patch;
    const updatedDraft = applyBuilderPatch(
      draft,
      patch,
      new Date().toISOString(),
    );
    const nextMessages: BuilderMessage[] = [
      ...draft.builderMessages,
      {
        id: createMessageId(),
        role: "user",
        content: message.trim(),
        createdAt: Date.now(),
      },
      {
        id: createMessageId(),
        role: "assistant",
        content: result.object.reply.trim(),
        createdAt: Date.now(),
      },
    ];

    const savedDraft = this.repository.saveCompanion({
      ...updatedDraft,
      builderMessages: nextMessages,
    }) as CompanionDraft;

    return {
      draft: savedDraft,
      reply: result.object.reply.trim(),
      patch,
    };
  }

  async previewCompanionDraft(
    input: CompanionPreviewRequest,
  ): Promise<CompanionPreviewResult> {
    const draft = assertDraft(
      this.repository.getCommunityCompanion(input.draftId),
      input.draftId,
    );
    const model = this.requireModel();
    const previewSystemPrompt = composeMarketplacePrompt({
      companion: draft,
      currentDate: new Date().toISOString().split("T")[0],
      sharedRulesTemplate: loadPrompt("companions/shared-worker-rules"),
      rosterText: buildCoreRoster(getAllCompanions()),
    });

    const preview = await generateText({
      model,
      temperature: draft.temperature,
      system: [previewSystemPrompt, "", loadPrompt("builder/preview")].join("\n"),
      messages: [
        ...toCoreMessages(input.messages),
        { role: "user", content: input.message.trim() },
      ],
    });

    return { reply: preview.text.trim() };
  }

  async publishCompanionDraft(companionId: string): Promise<PublishedCompanion> {
    const draft = assertDraft(
      this.repository.getCommunityCompanion(companionId),
      companionId,
    );
    const nowIso = new Date().toISOString();

    const validationErrors = validateDraftForPublish(draft);
    if (validationErrors.length > 0) {
      const failed = this.repository.saveCompanion({
        ...draft,
        status: "error",
        updatedAt: nowIso,
        lastError: validationErrors.join(" "),
      }) as CompanionDraft;
      throw new Error(failed.lastError ?? "Draft validation failed.");
    }

    const publishingDraft = this.repository.saveCompanion({
      ...draft,
      status: "publishing",
      updatedAt: nowIso,
      lastError: null,
    }) as CompanionDraft;

    try {
      const vector = await this.embedder.embed(buildEmbeddingText(publishingDraft));
      const published = toPublishedCompanion(publishingDraft, nowIso);
      const saved = this.repository.saveCompanion(published) as PublishedCompanion;

      this.repository.saveEmbedding({
        companionId: saved.id,
        model: this.embedder.modelName,
        vector,
        updatedAt: nowIso,
      });

      return saved;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to publish companion.";

      this.repository.saveCompanion({
        ...publishingDraft,
        status: "error",
        updatedAt: new Date().toISOString(),
        lastError: message,
      });

      throw new Error(message);
    }
  }

  async searchPublishedForPlanning(
    query: string,
    limit = 5,
  ): Promise<CompanionSearchResult[]> {
    return (await this.searchCompanions(query)).slice(0, limit);
  }

  getPublishedMarketplaceCompanion(id: string): PublishedCompanion | null {
    const companion = this.repository.getCommunityCompanion(id);
    return companion?.status === "published" ? companion : null;
  }

  private requireModel() {
    const provider = getProvider();
    const modelName = getModelName(provider);
    const model = createModel(provider, modelName);

    if (!model) {
      throw new Error("LLM model not configured.");
    }

    return model;
  }
}
