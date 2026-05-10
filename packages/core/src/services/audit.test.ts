// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDbClient } from "@commshub99/db";
import { afterEach, describe, expect, it } from "vitest";
import { tryWriteAuditLog, writeAuditLog } from "./audit.js";

const tempDirs: string[] = [];
const originalDbPath = process.env.COMMSHUB99_DB_PATH;

afterEach(() => {
  if (originalDbPath === undefined) {
    delete process.env.COMMSHUB99_DB_PATH;
  } else {
    process.env.COMMSHUB99_DB_PATH = originalDbPath;
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function seedAuditDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "commshub99-audit-"));
  tempDirs.push(dir);
  process.env.COMMSHUB99_DB_PATH = join(dir, "hub.db");

  const client = createDbClient();

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
    CREATE TABLE audit_log (
      id text PRIMARY KEY NOT NULL,
      tenant_id text NOT NULL,
      user_id text,
      action text NOT NULL,
      target_type text NOT NULL,
      target_id text NOT NULL,
      payload_json text NOT NULL,
      created_at integer NOT NULL
    );
    INSERT INTO users (id, email, name, password_hash, role, created_at, disabled)
      VALUES ('user-1', 'admin@example.com', 'Admin', 'hash', 'admin', 1, 0);
    INSERT INTO tenants (id, name, owner_user_id, created_at)
      VALUES ('tenant-1', 'Home', 'user-1', 1);
    INSERT INTO tenant_users (tenant_id, user_id, role, created_at)
      VALUES ('tenant-1', 'user-1', 'admin', 1);
  `);
  client.close();
}

describe("writeAuditLog", () => {
  it("writes an audit row for the user's tenant", () => {
    seedAuditDatabase();

    const result = writeAuditLog({
      action: "draft.approve",
      payload: { uuid: "draft-1" },
      targetId: "draft-1",
      targetType: "imessage_draft",
      userId: "user-1",
    });
    const client = createDbClient();

    try {
      const row = client.sqlite.prepare("SELECT * FROM audit_log").get() as {
        action: string;
        payload_json: string;
        target_id: string;
        tenant_id: string;
        user_id: string;
      };

      expect(result.tenantId).toBe("tenant-1");
      expect(row.tenant_id).toBe("tenant-1");
      expect(row.user_id).toBe("user-1");
      expect(row.action).toBe("draft.approve");
      expect(row.target_id).toBe("draft-1");
      expect(JSON.parse(row.payload_json)).toEqual({ uuid: "draft-1" });
    } finally {
      client.close();
    }
  });

  it("returns a best-effort error instead of throwing when audit infrastructure is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "commshub99-audit-missing-"));
    tempDirs.push(dir);
    process.env.COMMSHUB99_DB_PATH = join(dir, "hub.db");

    const client = createDbClient();
    client.sqlite.exec(`
      CREATE TABLE tenants (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        owner_user_id text NOT NULL,
        created_at integer NOT NULL
      );
      INSERT INTO tenants (id, name, owner_user_id, created_at)
        VALUES ('tenant-1', 'Home', 'user-1', 1);
    `);
    client.close();

    const result = tryWriteAuditLog({
      action: "draft.approve",
      targetId: "draft-1",
      targetType: "imessage_draft",
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error.message).toContain("audit_log");
  });
});
