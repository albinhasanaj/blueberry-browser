import type Database from "better-sqlite3";
import type {
  BuilderMessage,
  CatalogCompanion,
  CompanionDraft,
  CompanionToolName,
  PublishedCompanion,
} from "../../shared/companionMarketplace";
import { getCompanionDb } from "./db";

interface CompanionRow {
  id: string;
  status: CompanionDraft["status"] | PublishedCompanion["status"];
  name: string;
  description: string;
  instructions: string;
  best_for: string;
  tags_json: string;
  conversation_starters_json: string;
  tools_json: string;
  temperature: number;
  max_steps: number;
  tool_profile: CompanionDraft["toolProfile"];
  avatar_label: string;
  builder_messages_json: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface KeywordSearchRow {
  id: string;
  rank: number;
}

export interface StoredEmbedding {
  companionId: string;
  model: string;
  vector: number[];
  updatedAt: string;
}

export interface CompanionRepository {
  listDrafts(): CompanionDraft[];
  listPublishedCompanions(): PublishedCompanion[];
  getCommunityCompanion(id: string): CatalogCompanion | null;
  saveCompanion(companion: CatalogCompanion): CatalogCompanion;
  updateBuilderMessages(
    companionId: string,
    messages: BuilderMessage[],
    updatedAt: string,
  ): CompanionDraft;
  keywordSearchPublished(query: string, limit: number): KeywordSearchRow[];
  saveEmbedding(params: StoredEmbedding): void;
  getEmbedding(companionId: string): StoredEmbedding | null;
  getAllPublishedEmbeddings(): StoredEmbedding[];
}

function parseJsonArray(input: string): unknown[] {
  try {
    const value = JSON.parse(input);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function parseStringArray(input: string): string[] {
  return parseJsonArray(input).filter(
    (item): item is string => typeof item === "string",
  );
}

function parseBuilderMessages(input: string): BuilderMessage[] {
  try {
    const value = JSON.parse(input);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is BuilderMessage =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        typeof item.createdAt === "number",
    );
  } catch {
    return [];
  }
}

function mapRow(row: CompanionRow): CatalogCompanion {
  const base = {
    id: row.id,
    source: "community" as const,
    status: row.status,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    bestFor: row.best_for,
    tags: parseStringArray(row.tags_json),
    conversationStarters: parseStringArray(row.conversation_starters_json),
    temperature: row.temperature,
    maxSteps: row.max_steps,
    toolProfile: row.tool_profile,
    tools: parseStringArray(row.tools_json) as CompanionToolName[],
    avatarLabel: row.avatar_label,
    builderMessages: parseBuilderMessages(row.builder_messages_json),
    readOnly: false as const,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    lastError: row.last_error,
  };

  if (row.status === "published") {
    return base as PublishedCompanion;
  }

  return base as CompanionDraft;
}

function companionParams(companion: CatalogCompanion): Record<string, unknown> {
  return {
    id: companion.id,
    status: companion.status,
    name: companion.name,
    description: companion.description,
    instructions: companion.instructions,
    best_for: companion.bestFor,
    tags_json: JSON.stringify(companion.tags),
    conversation_starters_json: JSON.stringify(companion.conversationStarters),
    tools_json: JSON.stringify(companion.tools),
    temperature: companion.temperature,
    max_steps: companion.maxSteps,
    tool_profile: companion.toolProfile,
    avatar_label: companion.avatarLabel,
    builder_messages_json: JSON.stringify(companion.builderMessages),
    last_error: companion.lastError,
    created_at: companion.createdAt,
    updated_at: companion.updatedAt,
    published_at: companion.publishedAt,
  };
}

function normalizeMatchQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" OR ");
}

export class SqliteCompanionRepository implements CompanionRepository {
  private readonly db: Database.Database;

  constructor(db = getCompanionDb()) {
    this.db = db;
  }

  listDrafts(): CompanionDraft[] {
    const rows = this.db
      .prepare<[], CompanionRow>(
        `SELECT *
         FROM companions
         WHERE status != 'published'
         ORDER BY updated_at DESC`,
      )
      .all();
    return rows.map((row) => mapRow(row) as CompanionDraft);
  }

  listPublishedCompanions(): PublishedCompanion[] {
    const rows = this.db
      .prepare<[], CompanionRow>(
        `SELECT *
         FROM companions
         WHERE status = 'published'
         ORDER BY COALESCE(published_at, updated_at) DESC`,
      )
      .all();
    return rows.map((row) => mapRow(row) as PublishedCompanion);
  }

  getCommunityCompanion(id: string): CatalogCompanion | null {
    const row = this.db
      .prepare<[string], CompanionRow>(
        `SELECT *
         FROM companions
         WHERE id = ?`,
      )
      .get(id);
    return row ? mapRow(row) : null;
  }

  saveCompanion(companion: CatalogCompanion): CatalogCompanion {
    const params = companionParams(companion);
    this.db
      .prepare(
        `INSERT INTO companions (
          id,
          status,
          name,
          description,
          instructions,
          best_for,
          tags_json,
          conversation_starters_json,
          tools_json,
          temperature,
          max_steps,
          tool_profile,
          avatar_label,
          builder_messages_json,
          last_error,
          created_at,
          updated_at,
          published_at
        ) VALUES (
          @id,
          @status,
          @name,
          @description,
          @instructions,
          @best_for,
          @tags_json,
          @conversation_starters_json,
          @tools_json,
          @temperature,
          @max_steps,
          @tool_profile,
          @avatar_label,
          @builder_messages_json,
          @last_error,
          @created_at,
          @updated_at,
          @published_at
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          name = excluded.name,
          description = excluded.description,
          instructions = excluded.instructions,
          best_for = excluded.best_for,
          tags_json = excluded.tags_json,
          conversation_starters_json = excluded.conversation_starters_json,
          tools_json = excluded.tools_json,
          temperature = excluded.temperature,
          max_steps = excluded.max_steps,
          tool_profile = excluded.tool_profile,
          avatar_label = excluded.avatar_label,
          builder_messages_json = excluded.builder_messages_json,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at,
          published_at = excluded.published_at`,
      )
      .run(params);

    const next = this.getCommunityCompanion(companion.id);
    if (!next) {
      throw new Error(`Failed to save companion "${companion.id}"`);
    }
    return next;
  }

  updateBuilderMessages(
    companionId: string,
    messages: BuilderMessage[],
    updatedAt: string,
  ): CompanionDraft {
    this.db
      .prepare(
        `UPDATE companions
         SET builder_messages_json = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(messages), updatedAt, companionId);

    const next = this.getCommunityCompanion(companionId);
    if (!next || next.status === "published") {
      throw new Error(`Draft "${companionId}" not found`);
    }

    return next;
  }

  keywordSearchPublished(query: string, limit: number): KeywordSearchRow[] {
    const normalized = normalizeMatchQuery(query);
    if (!normalized) return [];

    try {
      return this.db
        .prepare<[string, number], KeywordSearchRow>(
          `SELECT companions.id AS id, bm25(companions_fts, 4.0, 3.0, 1.5, 1.5, 3.5) AS rank
           FROM companions_fts
           JOIN companions ON companions.row_id = companions_fts.rowid
           WHERE companions_fts MATCH ?
             AND companions.status = 'published'
           ORDER BY rank
           LIMIT ?`,
        )
        .all(normalized, limit);
    } catch {
      return [];
    }
  }

  saveEmbedding(params: StoredEmbedding): void {
    this.db
      .prepare(
        `INSERT INTO companion_embeddings (
          companion_id,
          embedding_model,
          embedding_json,
          embedding_updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(companion_id) DO UPDATE SET
          embedding_model = excluded.embedding_model,
          embedding_json = excluded.embedding_json,
          embedding_updated_at = excluded.embedding_updated_at`,
      )
      .run(
        params.companionId,
        params.model,
        JSON.stringify(params.vector),
        params.updatedAt,
      );
  }

  getEmbedding(companionId: string): StoredEmbedding | null {
    const row = this.db
      .prepare<
        [string],
        {
          companion_id: string;
          embedding_model: string;
          embedding_json: string;
          embedding_updated_at: string;
        }
      >(
        `SELECT *
         FROM companion_embeddings
         WHERE companion_id = ?`,
      )
      .get(companionId);

    if (!row) return null;

    return {
      companionId: row.companion_id,
      model: row.embedding_model,
      vector: parseJsonArray(row.embedding_json).map((value) => Number(value)),
      updatedAt: row.embedding_updated_at,
    };
  }

  getAllPublishedEmbeddings(): StoredEmbedding[] {
    const rows = this.db
      .prepare<
        [],
        {
          companion_id: string;
          embedding_model: string;
          embedding_json: string;
          embedding_updated_at: string;
        }
      >(
        `SELECT companion_embeddings.*
         FROM companion_embeddings
         JOIN companions ON companions.id = companion_embeddings.companion_id
         WHERE companions.status = 'published'`,
      )
      .all();

    return rows.map((row) => ({
      companionId: row.companion_id,
      model: row.embedding_model,
      vector: parseJsonArray(row.embedding_json).map((value) => Number(value)),
      updatedAt: row.embedding_updated_at,
    }));
  }
}
