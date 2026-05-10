// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approveImessageDraft, rejectImessageDraft, updateImessageDraft } from "./draft-actions.js";

const originalDataDir = process.env.IMSG_DATA_DIR;
let tempDir = "";

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-imessage-"));
  process.env.IMSG_DATA_DIR = tempDir;
  await mkdir(join(tempDir, "chats", "7", "drafts"), { recursive: true });
});

afterEach(() => {
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
