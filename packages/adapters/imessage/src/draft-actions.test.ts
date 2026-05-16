// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approveImessageDraft, rejectImessageDraft, updateImessageDraft } from "./draft-actions.js";

const originalDbPath = process.env.COMMSHUB99_DB_PATH;
const originalDataDir = process.env.IMSG_DATA_DIR;
let tempDir = "";

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-imessage-"));
  process.env.COMMSHUB99_DB_PATH = join(tempDir, "hub.db");
  process.env.IMSG_DATA_DIR = tempDir;
  await mkdir(join(tempDir, "chats", "7", "drafts"), { recursive: true });
});

afterEach(() => {
  if (originalDbPath === undefined) {
    delete process.env.COMMSHUB99_DB_PATH;
  } else {
    process.env.COMMSHUB99_DB_PATH = originalDbPath;
  }

  if (originalDataDir === undefined) {
    delete process.env.IMSG_DATA_DIR;
  } else {
    process.env.IMSG_DATA_DIR = originalDataDir;
  }

  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

function draftPath(uuid = "draft-1") {
  return join(tempDir, "chats", "7", "drafts", `${uuid}.md`);
}

function outboxPath(uuid = "draft-1") {
  return join(tempDir, "outbox", `${uuid}.md`);
}

function rejectedPath(uuid = "draft-1") {
  return join(tempDir, "rejected", `${uuid}.md`);
}

function writeDraft(uuid = "draft-1", extraMeta = "") {
  writeFileSync(
    draftPath(uuid),
    `---
uuid: ${uuid}
chat_id: 7
target_identifier: "+15551234567"
created_at: "2026-05-10T20:00:00Z"
source_rowid: 42
service: iMessage
model: gpt-5.5
reasoning: Keep it short.
${extraMeta}---
Hello there
`,
    "utf8",
  );
}

function seedContextDb({
  contactSignatureMode = "inherit",
  contactSignatureValue = "",
  globalSignature = "",
}: {
  contactSignatureMode?: "inherit" | "append" | "override";
  contactSignatureValue?: string;
  globalSignature?: string;
}) {
  const sqlite = new Database(process.env.COMMSHUB99_DB_PATH ?? join(tempDir, "hub.db"));

  try {
    sqlite.exec(`
      CREATE TABLE tenant_settings (
        tenant_id text PRIMARY KEY NOT NULL,
        signature text DEFAULT '' NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
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
    `);
    sqlite
      .prepare(
        `INSERT INTO tenant_settings (tenant_id, signature, created_at, updated_at)
        VALUES ('tenant-1', ?, 1, 1)`,
      )
      .run(globalSignature);

    if (contactSignatureValue || contactSignatureMode !== "inherit") {
      sqlite
        .prepare(
          `INSERT INTO contact_contexts (
            id,
            tenant_id,
            contact_key,
            signature_mode,
            signature_value,
            created_at,
            updated_at
          ) VALUES ('contact-context-1', 'tenant-1', '+15551234567', ?, ?, 1, 1)`,
        )
        .run(contactSignatureMode, contactSignatureValue);
    }
  } finally {
    sqlite.close();
  }
}

describe("iMessage draft actions", () => {
  it("updates a draft body in place", async () => {
    writeDraft();

    const result = await updateImessageDraft("draft-1", "Updated text");

    expect(result.draftPath).toBe(draftPath());
    expect(readFileSync(draftPath(), "utf8")).toContain("Updated text\n");
  });

  it("approves by writing an outbox item and removing the draft", async () => {
    writeDraft();

    const result = await approveImessageDraft("draft-1");

    expect(existsSync(draftPath())).toBe(false);
    expect(result.outboxPath).toBe(outboxPath());
    expect(readFileSync(outboxPath(), "utf8")).toContain('service: "imessage"');
    expect(readFileSync(outboxPath(), "utf8")).toContain('source_draft_uuid: "draft-1"');
  });

  it("approves the saved edited draft body", async () => {
    writeDraft();

    await updateImessageDraft("draft-1", "Edited before approve");
    await approveImessageDraft("draft-1");

    expect(readFileSync(outboxPath(), "utf8")).toContain("Edited before approve\n");
    expect(readFileSync(outboxPath(), "utf8")).not.toContain("Hello there");
  });

  it("appends the current global signature when approving", async () => {
    writeDraft();
    seedContextDb({ globalSignature: "- Global signature" });

    await approveImessageDraft("draft-1", { tenantId: "tenant-1" });

    const outbox = readFileSync(outboxPath(), "utf8");

    expect(outbox).toContain("Hello there\n\n- Global signature\n");
    expect(outbox).toContain('context_signature: "- Global signature"');
  });

  it("uses a contact signature override instead of the global signature", async () => {
    writeDraft();
    seedContextDb({
      contactSignatureMode: "override",
      contactSignatureValue: "- Contact signature",
      globalSignature: "- Global signature",
    });

    await approveImessageDraft("draft-1", { tenantId: "tenant-1" });

    const outbox = readFileSync(outboxPath(), "utf8");

    expect(outbox).toContain("Hello there\n\n- Contact signature\n");
    expect(outbox).toContain('context_signature: "- Contact signature"');
    expect(outbox).not.toContain("- Global signature");
  });

  it("blocks do_not_reply drafts unless explicitly overridden", async () => {
    writeDraft("draft-1", 'context_reply_posture: "do_not_reply"\n');

    await expect(approveImessageDraft("draft-1")).rejects.toThrow("do_not_reply");

    expect(existsSync(draftPath())).toBe(true);
    expect(existsSync(outboxPath())).toBe(false);
  });

  it("approves do_not_reply drafts with an explicit override", async () => {
    writeDraft(
      "draft-1",
      'context_reply_posture: "do_not_reply"\ncontext_version_ids: "v1"\ncontext_signature: "moon-levi"\n',
    );

    await approveImessageDraft("draft-1", { overrideContextSafeguards: true });

    const outbox = readFileSync(outboxPath(), "utf8");

    expect(existsSync(draftPath())).toBe(false);
    expect(outbox).toContain('context_reply_posture: "do_not_reply"');
    expect(outbox).toContain('context_version_ids: "v1"');
    expect(outbox).toContain('context_signature: "moon-levi"');
  });

  it("treats approve retry as complete when the outbox item already exists", async () => {
    writeDraft();
    await mkdir(join(tempDir, "outbox"), { recursive: true });
    writeFileSync(outboxPath(), "already queued", "utf8");

    const result = await approveImessageDraft("draft-1");

    expect(result.alreadyCompleted).toBe(true);
    expect(existsSync(draftPath())).toBe(false);
    expect(readFileSync(outboxPath(), "utf8")).toBe("already queued");
  });

  it("does not remove malformed drafts during approve", async () => {
    writeFileSync(draftPath(), "no frontmatter here", "utf8");

    await expect(approveImessageDraft("draft-1")).rejects.toThrow("required send fields");

    expect(existsSync(draftPath())).toBe(true);
    expect(existsSync(outboxPath())).toBe(false);
  });

  it("rejects by moving the draft with rules review metadata", async () => {
    writeDraft();

    const result = await rejectImessageDraft("draft-1", "Avoid this next time.");
    const rejected = readFileSync(rejectedPath(), "utf8");

    expect(result.rulesReviewStatus).toBe("pending_llm_review");
    expect(result.rejectedPath).toBe(rejectedPath());
    expect(existsSync(draftPath())).toBe(false);
    expect(rejected).toContain("rejected: true");
    expect(rejected).toContain('rules_review_status: "pending_llm_review"');
    expect(rejected).toContain('future_rules_note: "Avoid this next time."');
  });

  it("treats reject retry as complete when the rejected item already exists", async () => {
    writeDraft();
    await mkdir(join(tempDir, "rejected"), { recursive: true });
    writeFileSync(rejectedPath(), "already rejected", "utf8");

    const result = await rejectImessageDraft("draft-1", "");

    expect(result.alreadyCompleted).toBe(true);
    expect(result.rulesReviewStatus).toBe("not_requested");
    expect(existsSync(draftPath())).toBe(false);
    expect(readFileSync(rejectedPath(), "utf8")).toBe("already rejected");
  });

  it("does not move malformed drafts during reject", async () => {
    writeFileSync(draftPath(), "no frontmatter here", "utf8");

    await expect(rejectImessageDraft("draft-1", "")).rejects.toThrow("frontmatter");

    expect(existsSync(draftPath())).toBe(true);
    expect(existsSync(rejectedPath())).toBe(false);
  });
});
