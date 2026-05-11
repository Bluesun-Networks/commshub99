// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDbClient } from "@commshub99/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextService } from "./context.js";

const originalDbPath = process.env.COMMSHUB99_DB_PATH;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-context-"));
  process.env.COMMSHUB99_DB_PATH = join(tempDir, "hub.db");

  const client = createDbClient();

  try {
    client.sqlite.exec(`
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
        signature_mode text DEFAULT 'inherit' NOT NULL,
        signature_value text DEFAULT '' NOT NULL,
        allowed_personal_details_json text DEFAULT '[]' NOT NULL,
        custom_personal_details_json text DEFAULT '[]' NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE TABLE conversation_contexts (
        id text PRIMARY KEY NOT NULL,
        tenant_id text NOT NULL,
        channel_id text NOT NULL,
        room_key text NOT NULL,
        display_name text DEFAULT '' NOT NULL,
        relationship text DEFAULT 'unknown' NOT NULL,
        tone text DEFAULT 'warm' NOT NULL,
        reply_posture text DEFAULT 'reply_if_needed' NOT NULL,
        custom_prompt text DEFAULT '' NOT NULL,
        notes text DEFAULT '' NOT NULL,
        signature_mode text DEFAULT 'inherit' NOT NULL,
        signature_value text DEFAULT '' NOT NULL,
        allowed_personal_details_json text DEFAULT '[]' NOT NULL,
        custom_personal_details_json text DEFAULT '[]' NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE TABLE tenant_settings (
        tenant_id text PRIMARY KEY NOT NULL,
        signature text DEFAULT '' NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      INSERT INTO tenant_settings (tenant_id, signature, created_at, updated_at)
        VALUES ('tenant-1', 'moon', 1, 1);
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
        signature_mode,
        signature_value,
        allowed_personal_details_json,
        custom_personal_details_json,
        created_at,
        updated_at
      ) VALUES
        (
          'contact-context-1',
          'tenant-1',
          'phone:+15550000001',
          'Levi',
          'friend',
          'direct',
          'do_not_reply',
          'Never answer with commitments.',
          'Sensitive contact.',
          'append',
          '-levi',
          '["location","health_updates"]',
          '["school pickup"]',
          1,
          1
        ),
        (
          'contact-context-2',
          'tenant-1',
          'phone:+15550000002',
          'Sam',
          'professional',
          'warm',
          'usually_reply',
          '',
          '',
          'inherit',
          '',
          '["location"]',
          '["school pickup"]',
          1,
          1
        );
      INSERT INTO conversation_contexts (
        id,
        tenant_id,
        channel_id,
        room_key,
        display_name,
        relationship,
        tone,
        reply_posture,
        custom_prompt,
        notes,
        signature_mode,
        signature_value,
        allowed_personal_details_json,
        custom_personal_details_json,
        created_at,
        updated_at
      ) VALUES (
        'conversation-context-1',
        'tenant-1',
        'imessage',
        'chat-1',
        'Planning chat',
        'friend',
        'avoid_rude',
        'always_reply',
        'Keep the group concise.',
        'Room context note.',
        'append',
        '-room',
        '["location","daily_agenda"]',
        '["school pickup"]',
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

describe("ContextService", () => {
  it("resolves contact context before room context with conservative effective rules", () => {
    const bundle = new ContextService().resolve({
      channelId: "imessage",
      contactKeys: ["phone:+15550000002", "phone:+15550000001"],
      roomKey: "chat-1",
      tenantId: "tenant-1",
    });

    expect(bundle.contactContexts.map((context) => context.contactKey)).toEqual([
      "phone:+15550000001",
      "phone:+15550000002",
    ]);
    expect(bundle.conversationContext).toMatchObject({
      displayName: "Planning chat",
      roomKey: "chat-1",
    });
    expect(bundle.effective).toMatchObject({
      allowedPersonalDetails: ["location"],
      customPersonalDetails: ["school pickup"],
      replyPosture: "do_not_reply",
      signature: "moon-levi-room",
      tone: "avoid_rude",
    });
    expect(bundle.effective.customPrompt).toContain("Never answer with commitments.");
    expect(bundle.effective.customPrompt).toContain("Keep the group concise.");
    expect(bundle.effective.notes).toContain("Sensitive contact.");
    expect(bundle.effective.notes).toContain("Room context note.");
  });
});
