// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listImessageConversations } from "./conversations.js";

const originalDataDir = process.env.IMSG_DATA_DIR;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-imessage-"));
  process.env.IMSG_DATA_DIR = tempDir;

  const sqlite = new Database(join(tempDir, "imessage.sqlite"));
  const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "test",
    "fixtures",
    "imessage.sql",
  );

  sqlite.exec(readFileSync(fixturePath, "utf8"));
  sqlite.close();
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

describe("iMessage conversations", () => {
  it("maps fixture conversations and recent messages from the temp database", () => {
    const result = listImessageConversations();

    expect(result.error).toBeNull();
    expect(result.databasePath).toBe(join(tempDir, "imessage.sqlite"));
    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0]).toMatchObject({
      contact: "Ada Lovelace",
      id: "imessage:chat:7",
      lastMessage: "Latest outbound",
      linkedContact: {
        id: "contact-1",
        name: "Ada Lovelace",
      },
      status: "matched",
    });
    expect(result.conversations[0]?.messages.map((message) => message.body)).toEqual([
      "Older inbound",
      "Latest outbound",
    ]);
  });
});
