// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftFile = {
  path: string;
};

function resolveChatsPath() {
  const dataDir = process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
  return join(dataDir, "chats");
}

function resolveImessageDatabasePath() {
  const dataDir = process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
  return join(dataDir, "imessage.sqlite");
}

function frontmatterValue(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function displayDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parseDraft(filePath: string, content: string, sourceMessageAt = "") {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const frontmatter = new Map<string, string>();
  const text = (match?.[2] ?? content).trim();

  if (match?.[1]) {
    let lastKey: string | null = null;

    for (const rawLine of match[1].split(/\r?\n/)) {
      if (/^\s+/.test(rawLine) && lastKey) {
        const previous = frontmatter.get(lastKey) ?? "";
        frontmatter.set(lastKey, `${previous} ${rawLine.trim()}`.trim());
        continue;
      }

      const separatorIndex = rawLine.indexOf(":");

      if (separatorIndex === -1) {
        continue;
      }

      lastKey = rawLine.slice(0, separatorIndex).trim();
      frontmatter.set(lastKey, frontmatterValue(rawLine.slice(separatorIndex + 1)));
    }
  }

  const createdAt = frontmatter.get("created_at") ?? "";
  const chatId = frontmatter.get("chat_id") ?? (filePath.match(/\/chats\/([^/]+)\//)?.[1] || "");
  const uuid = frontmatter.get("uuid") ?? (filePath.split("/").at(-1)?.replace(/\.md$/, "") || "");
  const sourceRowid = Number(frontmatter.get("source_rowid"));

  return {
    approved: frontmatter.get("approved") === "true",
    chatId,
    createdAt,
    displayCreatedAt: displayDate(createdAt),
    displaySourceMessageAt: sourceMessageAt ? displayDate(sourceMessageAt) : "",
    model: frontmatter.get("model") ?? "",
    reasoning: frontmatter.get("reasoning") ?? "",
    sourceRowid: Number.isFinite(sourceRowid) ? sourceRowid : null,
    sourceMessageAt,
    targetIdentifier: frontmatter.get("target_identifier") ?? "",
    text,
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

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  const draftFiles = await collectDraftFiles(resolveChatsPath());
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

  return NextResponse.json({
    drafts: drafts.slice(0, 100),
  });
}
