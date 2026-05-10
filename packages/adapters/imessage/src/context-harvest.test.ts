// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { harvestImessageContextSuggestions } from "./context-harvest.js";

const originalDataDir = process.env.IMSG_DATA_DIR;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-imessage-harvest-"));
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

describe("harvestImessageContextSuggestions", () => {
  it("produces reviewable suggestions from fixture chats", () => {
    const result = harvestImessageContextSuggestions();

    expect(result.error).toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]).toMatchObject({
      confidence: expect.any(Number),
      evidence: expect.arrayContaining([
        expect.objectContaining({
          rowid: expect.any(Number),
          snippet: expect.any(String),
        }),
      ]),
      source: "harvest",
    });
  });
});
