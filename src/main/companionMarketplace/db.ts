import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "path";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS companions (
  row_id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  id                         TEXT    NOT NULL UNIQUE,
  status                     TEXT    NOT NULL,
  name                       TEXT    NOT NULL,
  description                TEXT    NOT NULL,
  instructions               TEXT    NOT NULL,
  best_for                   TEXT    NOT NULL,
  tags_json                  TEXT    NOT NULL DEFAULT '[]',
  conversation_starters_json TEXT    NOT NULL DEFAULT '[]',
  tools_json                 TEXT    NOT NULL DEFAULT '[]',
  temperature                REAL    NOT NULL,
  max_steps                  INTEGER NOT NULL,
  tool_profile               TEXT    NOT NULL,
  avatar_label               TEXT    NOT NULL,
  builder_messages_json      TEXT    NOT NULL DEFAULT '[]',
  last_error                 TEXT,
  created_at                 TEXT    NOT NULL,
  updated_at                 TEXT    NOT NULL,
  published_at               TEXT
);

CREATE TABLE IF NOT EXISTS companion_embeddings (
  companion_id          TEXT PRIMARY KEY,
  embedding_model       TEXT NOT NULL,
  embedding_json        TEXT NOT NULL,
  embedding_updated_at  TEXT NOT NULL,
  FOREIGN KEY (companion_id) REFERENCES companions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_companions_status ON companions(status);
CREATE INDEX IF NOT EXISTS idx_companions_published_at ON companions(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_companions_updated_at ON companions(updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS companions_fts USING fts5(
  name,
  description,
  instructions,
  tags,
  best_for,
  content='companions',
  content_rowid='row_id'
);

CREATE TRIGGER IF NOT EXISTS companions_ai AFTER INSERT ON companions BEGIN
  INSERT INTO companions_fts(rowid, name, description, instructions, tags, best_for)
  VALUES (new.row_id, new.name, new.description, new.instructions, new.tags_json, new.best_for);
END;

CREATE TRIGGER IF NOT EXISTS companions_ad AFTER DELETE ON companions BEGIN
  INSERT INTO companions_fts(companions_fts, rowid, name, description, instructions, tags, best_for)
  VALUES('delete', old.row_id, old.name, old.description, old.instructions, old.tags_json, old.best_for);
END;

CREATE TRIGGER IF NOT EXISTS companions_au AFTER UPDATE ON companions BEGIN
  INSERT INTO companions_fts(companions_fts, rowid, name, description, instructions, tags, best_for)
  VALUES('delete', old.row_id, old.name, old.description, old.instructions, old.tags_json, old.best_for);
  INSERT INTO companions_fts(rowid, name, description, instructions, tags, best_for)
  VALUES (new.row_id, new.name, new.description, new.instructions, new.tags_json, new.best_for);
END;
`;

let db: Database.Database | null = null;

export function getCompanionDbPath(): string {
  return join(app.getPath("userData"), "companions.db");
}

export function initCompanionDb(dbPath?: string): Database.Database {
  const path = dbPath ?? getCompanionDbPath();
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}

export function getCompanionDb(): Database.Database {
  if (!db) {
    throw new Error(
      "Companion database not initialized. Call initCompanionDb() first.",
    );
  }

  return db;
}
