// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDbClient, resolveDatabasePath } from "./client.js";
import { runMigrations } from "./migrate.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function expectTable(client: ReturnType<typeof createDbClient>, name: string) {
  expect(
    client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name),
  ).toMatchObject({ name });
}

function createLegacyAuthTables(client: ReturnType<typeof createDbClient>) {
  client.sqlite.exec(`
    CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL,
      name text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL,
      created_at integer NOT NULL,
      disabled integer NOT NULL
    );
    CREATE TABLE sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      token text NOT NULL,
      expires_at integer NOT NULL,
      created_at integer NOT NULL
    );
    CREATE TABLE tenants (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      owner_user_id text NOT NULL,
      created_at integer NOT NULL
    );
    CREATE TABLE tenant_users (
      tenant_id text NOT NULL,
      user_id text NOT NULL,
      role text NOT NULL,
      created_at integer NOT NULL,
      PRIMARY KEY (tenant_id, user_id)
    );
  `);
}

describe("createDbClient", () => {
  it("creates the SQLite file and parent directory when opened", () => {
    const dir = mkdtempSync(join(tmpdir(), "commshub99-db-"));
    tempDirs.push(dir);
    const path = join(dir, "nested", "hub.db");

    const client = createDbClient({ path });
    client.close();

    expect(existsSync(path)).toBe(true);
  });

  it("applies migrations on a fresh database", () => {
    const dir = mkdtempSync(join(tmpdir(), "commshub99-db-"));
    tempDirs.push(dir);
    const client = createDbClient({ path: join(dir, "hub.db") });

    try {
      migrate(client.db, {
        migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../migrations"),
      });

      const row = client.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'scheduled_sends'")
        .get() as { name?: string } | undefined;

      expect(row?.name).toBe("scheduled_sends");
    } finally {
      client.close();
    }
  });

  it("upgrades a legacy local database without a Drizzle migration journal", () => {
    const dir = mkdtempSync(join(tmpdir(), "commshub99-db-"));
    tempDirs.push(dir);
    const path = join(dir, "hub.db");
    const client = createDbClient({ path });

    createLegacyAuthTables(client);
    client.close();

    const upgradedPath = runMigrations(createDbClient({ path }));
    const upgraded = createDbClient({ path });

    try {
      expect(upgradedPath).toBe(path);
      expectTable(upgraded, "audit_log");
      expectTable(upgraded, "scheduled_sends");
      expectTable(upgraded, "__drizzle_migrations");
    } finally {
      upgraded.close();
    }
  });

  it("upgrades a legacy local database with an empty Drizzle migration journal", () => {
    const dir = mkdtempSync(join(tmpdir(), "commshub99-db-"));
    tempDirs.push(dir);
    const path = join(dir, "hub.db");
    const client = createDbClient({ path });

    createLegacyAuthTables(client);
    client.sqlite.exec(`
      CREATE TABLE "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      );
    `);
    client.close();

    const upgradedPath = runMigrations(createDbClient({ path }));
    const upgraded = createDbClient({ path });

    try {
      expect(upgradedPath).toBe(path);
      expectTable(upgraded, "audit_log");
      expectTable(upgraded, "scheduled_sends");
      expectTable(upgraded, "__drizzle_migrations");
    } finally {
      upgraded.close();
    }
  });
});

describe("resolveDatabasePath", () => {
  it("uses an explicit path before environment defaults", () => {
    expect(resolveDatabasePath({ path: "/tmp/commshub99-explicit.db" })).toBe(
      "/tmp/commshub99-explicit.db",
    );
  });
});
