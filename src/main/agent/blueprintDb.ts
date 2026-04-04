import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "path";

export interface BlueprintRow {
  id: number;
  domain: string;
  intent: string;
  selector: string;
  selector_type: string;
  description: string | null;
  verified_at: string;
  created_at: string;
  success_count: number;
  fail_count: number;
  confidence: number;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS blueprints (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  domain        TEXT    NOT NULL,
  intent        TEXT    NOT NULL,
  selector      TEXT    NOT NULL,
  selector_type TEXT    NOT NULL DEFAULT 'css',
  description   TEXT,
  verified_at   TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  success_count INTEGER NOT NULL DEFAULT 1,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  confidence    REAL    NOT NULL DEFAULT 1.0,
  UNIQUE(domain, intent, selector)
);
CREATE INDEX IF NOT EXISTS idx_blueprints_domain ON blueprints(domain);
CREATE INDEX IF NOT EXISTS idx_domain_confidence ON blueprints(domain, confidence DESC);
`;

let db: Database.Database | null = null;

export function getDbPath(): string {
  return join(app.getPath("userData"), "blueprints.db");
}

export function initDb(dbPath?: string): Database.Database {
  const path = dbPath ?? getDbPath();
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);

  // One-time cleanup: remove known bad selectors from before fix deployment
  try {
    db.prepare(`DELETE FROM blueprints WHERE selector = 'input#search' AND domain = 'www.youtube.com'`).run();
  } catch { /* ignore if table is empty */ }

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Blueprint database not initialized. Call initDb() first.");
  }
  return db;
}

export function upsertBlueprint(
  domain: string,
  intent: string,
  selector: string,
  selectorType: string,
  description: string,
): void {
  const d = getDb();
  const now = new Date().toISOString();

  d.prepare(
    `INSERT OR IGNORE INTO blueprints (domain, intent, selector, selector_type, description, verified_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(domain, intent, selector, selectorType, description, now);

  d.prepare(
    `UPDATE blueprints
     SET success_count = success_count + 1,
         verified_at = ?,
         description = ?,
         confidence = CAST(success_count + 1 AS REAL) / (success_count + 1 + fail_count)
     WHERE domain = ? AND intent = ? AND selector = ?`,
  ).run(now, description, domain, intent, selector);
}

export function recordFailure(domain: string, selector: string): void {
  const d = getDb();

  d.prepare(
    `UPDATE blueprints
     SET fail_count = fail_count + 1,
         confidence = CAST(success_count AS REAL) / (success_count + fail_count + 1)
     WHERE domain = ? AND selector = ?`,
  ).run(domain, selector);

  d.prepare(
    `DELETE FROM blueprints WHERE domain = ? AND selector = ? AND confidence < 0.2`,
  ).run(domain, selector);
}

export function queryBlueprints(domain: string): BlueprintRow[] {
  const d = getDb();
  return d
    .prepare(
      `SELECT * FROM blueprints
       WHERE domain = ? AND confidence >= 0.5
       ORDER BY confidence DESC
       LIMIT 15`,
    )
    .all(domain) as BlueprintRow[];
}

export function pruneStale(): void {
  const d = getDb();

  d.prepare(
    `UPDATE blueprints
     SET confidence = MAX(0.0, confidence - 0.1)
     WHERE verified_at < datetime('now', '-7 days')`,
  ).run();

  d.prepare(`DELETE FROM blueprints WHERE confidence < 0.2`).run();
}
