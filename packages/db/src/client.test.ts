// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDbClient, resolveDatabasePath } from "./client.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
});

describe("resolveDatabasePath", () => {
  it("uses an explicit path before environment defaults", () => {
    expect(resolveDatabasePath({ path: "/tmp/commshub99-explicit.db" })).toBe(
      "/tmp/commshub99-explicit.db",
    );
  });
});
