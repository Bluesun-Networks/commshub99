// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Database as SqliteDatabase } from "better-sqlite3";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export const DEFAULT_DATA_DIR = ".commshub99";
export const DEFAULT_DATABASE_FILENAME = "hub.db";

export interface ResolveDatabasePathOptions {
  env?: NodeJS.ProcessEnv;
  path?: string;
}

export interface CreateDbClientOptions extends ResolveDatabasePathOptions {
  readonly?: boolean;
}

export interface DbClient {
  close: () => void;
  db: BetterSQLite3Database;
  path: string;
  sqlite: SqliteDatabase;
}

export function resolveDatabasePath(options: ResolveDatabasePathOptions = {}): string {
  if (options.path) return options.path;

  const env = options.env ?? process.env;
  return (
    env.COMMSHUB99_DB_PATH ??
    env.DATABASE_URL ??
    join(homedir(), DEFAULT_DATA_DIR, DEFAULT_DATABASE_FILENAME)
  );
}

export function createDbClient(options: CreateDbClientOptions = {}): DbClient {
  const path = resolveDatabasePath(options);

  if (!options.readonly) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path, {
    readonly: options.readonly ?? false,
  });
  const db = drizzle(sqlite);

  return {
    db,
    path,
    sqlite,
    close: () => sqlite.close(),
  };
}
