// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { writeAuditLog } from "@commshub99/core";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { requirePermissionRequest } from "../../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveChatsPath() {
  const dataDir = process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
  return join(dataDir, "chats");
}

function resolveDataPath() {
  return process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
}

function resolveImessageDatabasePath() {
  return join(resolveDataPath(), "imessage.sqlite");
}

async function findDraftPath(directory: string, uuid: string): Promise<string | null> {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      const match = await findDraftPath(entryPath, uuid);

      if (match) {
        return match;
      }
    }

    if (entry.isFile() && entry.name === `${uuid}.md` && entryPath.includes("/drafts/")) {
      return entryPath;
    }
  }

  return null;
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

function parseDraft(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    throw new Error("Draft is missing frontmatter");
  }

  const frontmatter = match[1] ?? "";
  const meta = new Map<string, string>();

  let lastKey: string | null = null;
  for (const rawLine of frontmatter.split(/\r?\n/)) {
    if (/^\s+/.test(rawLine) && lastKey) {
      const previous = meta.get(lastKey) ?? "";
      meta.set(lastKey, `${previous} ${rawLine.trim()}`.trim());
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    lastKey = rawLine.slice(0, separatorIndex).trim();
    meta.set(lastKey, frontmatterValue(rawLine.slice(separatorIndex + 1)));
  }

  return {
    body: (match[2] ?? "").trim(),
    meta,
  };
}

function yamlScalar(value: string | number | boolean) {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

function readChatService(chatId: number) {
  const databasePath = resolveImessageDatabasePath();

  if (!existsSync(databasePath)) {
    return "";
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const row = sqlite.prepare("SELECT service FROM chats WHERE id = ?").get(chatId) as
      | { service?: string }
      | undefined;

    return row?.service ?? "";
  } finally {
    sqlite.close();
  }
}

function sendService(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "imessage" || normalized === "sms" || normalized === "auto") {
    return normalized;
  }

  return "";
}

function writeOutboxContent(content: string) {
  const { body, meta } = parseDraft(content);
  const outboxMeta = new Map<string, string | number | boolean>();
  const uuid = meta.get("uuid");
  const chatId = meta.get("chat_id");

  if (!uuid || !chatId || !body) {
    throw new Error("Draft is missing required send fields");
  }

  outboxMeta.set("uuid", uuid);
  const numericChatId = Number(chatId);

  outboxMeta.set("chat_id", numericChatId);
  outboxMeta.set("target_identifier", meta.get("target_identifier") ?? "");
  outboxMeta.set("created_at", meta.get("created_at") ?? new Date().toISOString());
  outboxMeta.set("source_draft_uuid", uuid);
  outboxMeta.set("reasoning", meta.get("reasoning") ?? "");
  outboxMeta.set("auto_approved", meta.get("auto_approved") === "true");

  const service = sendService(meta.get("service") || readChatService(numericChatId));
  if (service) {
    outboxMeta.set("service", service);
  }

  const sourceRowid = Number(meta.get("source_rowid"));
  if (Number.isFinite(sourceRowid)) {
    outboxMeta.set("source_rowid", sourceRowid);
  }

  const model = meta.get("model");
  if (model) {
    outboxMeta.set("model", model);
  }

  const frontmatter = [...outboxMeta]
    .map(([key, value]) => `${key}: ${yamlScalar(value)}`)
    .join("\n");

  return `---\n${frontmatter}\n---\n${body}\n`;
}

async function atomicWrite(path: string, content: string) {
  const tmpPath = `${path}.tmp`;

  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, path);
}

function outboxPathFor(uuid: string) {
  return join(resolveDataPath(), "outbox", `${uuid}.md`);
}

function isDraftPath(path: string) {
  return path.includes(`${sep}drafts${sep}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = requirePermissionRequest(request, "drafts:approve");

  if (auth.response) {
    return auth.response;
  }

  const { uuid } = await params;
  const draftPath = await findDraftPath(resolveChatsPath(), uuid);

  if (!draftPath) {
    return NextResponse.json(
      { error: "Draft was not found or has already moved" },
      { status: 404 },
    );
  }

  const content = await readFile(draftPath, "utf8");
  if (!isDraftPath(draftPath)) {
    return NextResponse.json({ error: "Refusing to approve non-draft file" }, { status: 400 });
  }

  await atomicWrite(outboxPathFor(uuid), writeOutboxContent(content));
  await unlink(draftPath);
  writeAuditLog({
    action: "draft.approve",
    payload: {
      path: draftPath,
    },
    targetId: uuid,
    targetType: "imessage_draft",
    userId: auth.session.user.id,
  });

  return NextResponse.json({
    status: "queued",
    uuid,
  });
}
