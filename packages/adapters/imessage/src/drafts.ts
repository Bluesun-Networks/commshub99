// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import { displayDate } from "./format.js";
import { parseFrontmatter } from "./frontmatter.js";
import { resolveImessageChatsPath, resolveImessageDatabasePath } from "./paths.js";

type DraftFile = {
  path: string;
};

function parseDraft(filePath: string, content: string, sourceMessageAt = "") {
  const { body, meta } = parseFrontmatter(content);
  const createdAt = meta.get("created_at") ?? "";
  const chatId = meta.get("chat_id") ?? (filePath.match(/\/chats\/([^/]+)\//)?.[1] || "");
  const uuid = meta.get("uuid") ?? (filePath.split("/").at(-1)?.replace(/\.md$/, "") || "");
  const sourceRowid = Number(meta.get("source_rowid"));

  return {
    approved: meta.get("approved") === "true",
    chatId,
    createdAt,
    displayCreatedAt: displayDate(createdAt),
    displaySourceMessageAt: sourceMessageAt ? displayDate(sourceMessageAt) : "",
    model: meta.get("model") ?? "",
    reasoning: meta.get("reasoning") ?? "",
    sourceMessageAt,
    sourceRowid: Number.isFinite(sourceRowid) ? sourceRowid : null,
    targetIdentifier: meta.get("target_identifier") ?? "",
    text: body,
    uuid,
  };
}

function readSourceMessageDates(rowids: number[]) {
  const databasePath = resolveImessageDatabasePath();
  const dates = new Map<number, string>();

  if (rowids.length === 0 || !existsSync(databasePath)) {
    return dates;
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const statement = sqlite.prepare("SELECT date FROM messages WHERE rowid = ?");

    for (const rowid of rowids) {
      const row = statement.get(rowid) as { date?: string } | undefined;

      if (row?.date) {
        dates.set(rowid, row.date);
      }
    }
  } finally {
    sqlite.close();
  }

  return dates;
}

async function collectDraftFiles(directory: string): Promise<DraftFile[]> {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectDraftFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith(".md") && entryPath.includes("/drafts/")) {
        return [{ path: entryPath }];
      }

      return [];
    }),
  );

  return files.flat();
}

export async function listImessageDrafts() {
  const draftFiles = await collectDraftFiles(resolveImessageChatsPath());
  const draftContents = await Promise.all(
    draftFiles.map(async (file) => ({
      content: await readFile(file.path, "utf8"),
      file,
    })),
  );
  const preliminaryDrafts = draftContents.map(({ content, file }) =>
    parseDraft(file.path, content),
  );
  const sourceMessageDates = readSourceMessageDates(
    preliminaryDrafts
      .map((draft) => draft.sourceRowid)
      .filter((rowid): rowid is number => typeof rowid === "number"),
  );
  const drafts = draftContents.map(({ content, file }, index) => {
    const sourceRowid = preliminaryDrafts[index]?.sourceRowid;

    return parseDraft(
      file.path,
      content,
      typeof sourceRowid === "number" ? (sourceMessageDates.get(sourceRowid) ?? "") : "",
    );
  });

  drafts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return drafts.slice(0, 100);
}
