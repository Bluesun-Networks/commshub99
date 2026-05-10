// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDbClient } from "@commshub99/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextHistoryService } from "./context-history.js";

const originalDbPath = process.env.COMMSHUB99_DB_PATH;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-context-history-"));
  process.env.COMMSHUB99_DB_PATH = join(tempDir, "hub.db");

  const client = createDbClient();

  try {
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
      CREATE TABLE contact_contexts (
        id text PRIMARY KEY NOT NULL,
        tenant_id text NOT NULL,
        contact_key text NOT NULL,
        display_name text DEFAULT '' NOT NULL,
        relationship text DEFAULT 'unknown' NOT NULL,
        tone text DEFAULT 'warm' NOT NULL,
        reply_posture text DEFAULT 'reply_if_needed' NOT NULL,
        custom_prompt text DEFAULT '' NOT NULL,
        notes text DEFAULT '' NOT NULL,
        allowed_personal_details_json text DEFAULT '[]' NOT NULL,
        custom_personal_details_json text DEFAULT '[]' NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE TABLE context_versions (
        id text PRIMARY KEY NOT NULL,
        tenant_id text NOT NULL,
        context_type text NOT NULL,
        context_id text NOT NULL,
        operation text NOT NULL,
        actor_user_id text,
        before_json text,
        after_json text,
        source text DEFAULT 'human' NOT NULL,
        confidence real,
        review_status text DEFAULT 'approved' NOT NULL,
        created_at integer NOT NULL
      );
      INSERT INTO users (id, email, name, password_hash, role, created_at, disabled)
        VALUES ('user-1', 'admin@example.com', 'Admin', 'hash', 'admin', 1, 0);
      INSERT INTO tenants (id, name, owner_user_id, created_at)
        VALUES ('tenant-1', 'Home', 'user-1', 1);
      INSERT INTO contact_contexts (
        id,
        tenant_id,
        contact_key,
        display_name,
        relationship,
        tone,
        reply_posture,
        custom_prompt,
        notes,
        allowed_personal_details_json,
        custom_personal_details_json,
        created_at,
        updated_at
      ) VALUES (
        'context-1',
        'tenant-1',
        'phone:+15551234567',
        'Levi',
        'friend',
        'warm',
        'usually_reply',
        '',
        'Old note',
        '["location"]',
        '[]',
        1,
        1
      );
    `);
  } finally {
    client.close();
  }
});

afterEach(() => {
  if (originalDbPath === undefined) {
    delete process.env.COMMSHUB99_DB_PATH;
  } else {
    process.env.COMMSHUB99_DB_PATH = originalDbPath;
  }

  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

function contactContext() {
  const client = createDbClient();

  try {
    return client.sqlite.prepare("SELECT * FROM contact_contexts WHERE id = 'context-1'").get() as
      | Record<string, unknown>
      | undefined;
  } finally {
    client.close();
  }
}

describe("ContextHistoryService", () => {
  it("records and lists context history with review metadata", () => {
    const service = new ContextHistoryService();
    const after = { ...contactContext(), notes: "New note", updated_at: 2 };

    const created = service.record({
      actorUserId: "user-1",
      after,
      before: contactContext() ?? null,
      confidence: 0.84,
      contextId: "context-1",
      contextType: "contact",
      id: "version-1",
      operation: "update",
      reviewStatus: "pending",
      source: "harvest",
      tenantId: "tenant-1",
    });

    expect(created).toMatchObject({
      actorUserId: "user-1",
      confidence: 0.84,
      contextId: "context-1",
      contextType: "contact",
      id: "version-1",
      operation: "update",
      reviewStatus: "pending",
      source: "harvest",
      tenantId: "tenant-1",
    });
    expect(service.list({ tenantId: "tenant-1" })).toHaveLength(1);
    expect(service.supersede("version-1")).toMatchObject({ reviewStatus: "superseded" });
  });

  it("rolls back a contact context to the previous payload", () => {
    const service = new ContextHistoryService();
    const before = contactContext() ?? {};
    const after = { ...before, notes: "New note", updated_at: 2 };
    const client = createDbClient();

    try {
      client.sqlite
        .prepare("UPDATE contact_contexts SET notes = 'New note', updated_at = 2 WHERE id = ?")
        .run("context-1");
    } finally {
      client.close();
    }

    service.record({
      actorUserId: "user-1",
      after,
      before,
      contextId: "context-1",
      contextType: "contact",
      id: "version-1",
      operation: "update",
      tenantId: "tenant-1",
    });

    const rollback = service.rollback("version-1", "user-1");

    expect(contactContext()).toMatchObject({ notes: "Old note" });
    expect(service.get("version-1")).toMatchObject({ reviewStatus: "superseded" });
    expect(rollback).toMatchObject({
      actorUserId: "user-1",
      after: expect.objectContaining({ notes: "Old note" }),
      before: expect.objectContaining({ notes: "New note" }),
      operation: "rollback",
    });
  });
});
