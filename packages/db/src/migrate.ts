// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDbClient, type DbClient } from "./client.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const legacyBaselineMigrationTags = new Set([
  "0000_round_morph",
  "0001_heavy_sauron",
  "0002_faulty_rocket_racer",
]);

type MigrationFile = {
  createdAt: number;
  name: string;
  tag: string;
};

function migrationFiles(): MigrationFile[] {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as {
    entries: Array<{ tag: string; when: number }>;
  };

  return journal.entries.map((entry) => ({
    createdAt: entry.when,
    name: `${entry.tag}.sql`,
    tag: entry.tag,
  }));
}

function legacyBaselineMigrationFiles() {
  return migrationFiles().filter((migrationFile) =>
    legacyBaselineMigrationTags.has(migrationFile.tag),
  );
}

function tableExists(sqlite: SqliteDatabase, tableName: string) {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;

  return row?.name === tableName;
}

function databaseHasUserTables(sqlite: SqliteDatabase) {
  const row = sqlite
    .prepare(
      `SELECT count(*) AS count
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name != '__drizzle_migrations'`,
    )
    .get() as { count: number };

  return row.count > 0;
}

function appliedMigrationHashes(sqlite: SqliteDatabase) {
  if (!tableExists(sqlite, "__drizzle_migrations")) {
    return new Set<string>();
  }

  const rows = sqlite.prepare('SELECT hash FROM "__drizzle_migrations"').all() as Array<{
    hash: string;
  }>;

  return new Set(rows.map((row) => row.hash));
}

function migrationHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function idempotentSql(content: string) {
  return content
    .replaceAll("--> statement-breakpoint", "")
    .replaceAll(/CREATE TABLE `/g, "CREATE TABLE IF NOT EXISTS `")
    .replaceAll(/CREATE INDEX `/g, "CREATE INDEX IF NOT EXISTS `")
    .replaceAll(/CREATE UNIQUE INDEX `/g, "CREATE UNIQUE INDEX IF NOT EXISTS `");
}

function addColumnIfMissing(sqlite: SqliteDatabase, tableName: string, columnSql: string) {
  try {
    sqlite.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`).run();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
      throw error;
    }
  }
}

function ensureLegacyColumns(sqlite: SqliteDatabase) {
  if (tableExists(sqlite, "users")) {
    addColumnIfMissing(sqlite, "users", "last_login_at integer");
    addColumnIfMissing(sqlite, "users", "disabled integer DEFAULT 0 NOT NULL");
  }

  if (tableExists(sqlite, "sessions")) {
    addColumnIfMissing(sqlite, "sessions", "updated_at integer");
    addColumnIfMissing(sqlite, "sessions", "ip_address text");
    addColumnIfMissing(sqlite, "sessions", "user_agent text");
  }
}

function seedMigrationJournal(sqlite: SqliteDatabase) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    );
  `);

  const insert = sqlite.prepare(
    `INSERT INTO "__drizzle_migrations" (hash, created_at)
    SELECT ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM "__drizzle_migrations" WHERE hash = ?
    )`,
  );

  for (const migrationFile of legacyBaselineMigrationFiles()) {
    const content = readFileSync(join(migrationsFolder, migrationFile.name), "utf8");
    const hash = migrationHash(content);

    insert.run(hash, migrationFile.createdAt, hash);
  }
}

function applyLegacyCompatibleMigrations(sqlite: SqliteDatabase) {
  ensureLegacyColumns(sqlite);

  for (const migrationFile of legacyBaselineMigrationFiles()) {
    const content = readFileSync(join(migrationsFolder, migrationFile.name), "utf8");

    sqlite.exec(idempotentSql(content));
  }

  seedMigrationJournal(sqlite);
}

export function runMigrations(client: DbClient = createDbClient()) {
  try {
    if (databaseHasUserTables(client.sqlite) && appliedMigrationHashes(client.sqlite).size === 0) {
      applyLegacyCompatibleMigrations(client.sqlite);
    }

    migrate(client.db, { migrationsFolder });

    return client.path;
  } finally {
    client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const path = runMigrations();

  console.log(`Applied migrations to ${path}`);
}
