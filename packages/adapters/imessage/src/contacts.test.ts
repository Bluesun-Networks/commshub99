// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listImessageContactConversationCounts } from "./contacts.js";

const originalDataDir = process.env.IMSG_DATA_DIR;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-imessage-"));
  process.env.IMSG_DATA_DIR = tempDir;
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

function createDatabase() {
  const databasePath = join(tempDir, "imessage.sqlite");
  const sqlite = new Database(databasePath);

  sqlite.exec(`
    CREATE TABLE chat_contact_matches (
      chat_id INTEGER NOT NULL,
      contact_id TEXT,
      status TEXT NOT NULL
    );

    INSERT INTO chat_contact_matches (chat_id, contact_id, status)
    VALUES
      (1, 'contact-a', 'matched'),
      (1, 'contact-a', 'matched'),
      (2, 'contact-a', 'matched'),
      (3, 'contact-b', 'matched'),
      (4, 'contact-b', 'unmatched'),
      (5, NULL, 'matched');
  `);
  sqlite.close();

  return databasePath;
}

describe("iMessage contact conversation counts", () => {
  it("returns matched distinct chat counts by contact id", () => {
    const databasePath = createDatabase();

    const result = listImessageContactConversationCounts();

    expect(result.databasePath).toBe(databasePath);
    expect(result.error).toBeNull();
    expect(result.conversationCounts.get("contact-a")).toBe(2);
    expect(result.conversationCounts.get("contact-b")).toBe(1);
  });

  it("returns an empty result when the iMessage database is missing", () => {
    const result = listImessageContactConversationCounts();

    expect(existsSync(result.databasePath)).toBe(false);
    expect(result.error).toContain("No iMessage database found");
    expect(result.conversationCounts.size).toBe(0);
  });
});
