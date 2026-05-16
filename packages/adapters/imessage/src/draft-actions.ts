// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { ContextService } from "@commshub99/core";
import Database from "better-sqlite3";
import { parseFrontmatter } from "./frontmatter.js";
import {
  resolveImessageChatsPath,
  resolveImessageDatabasePath,
  resolveImessageDataPath,
} from "./paths.js";

export interface DraftActionResult {
  alreadyCompleted?: boolean;
  draftPath: string;
  outboxPath?: string;
  rejectedPath?: string;
  rulesReviewStatus?: "not_requested" | "pending_llm_review";
  uuid: string;
}

export interface ApproveImessageDraftOptions {
  overrideContextSafeguards?: boolean;
  tenantId?: string;
}

type ChatContextInput = {
  contactKeys: string[];
  roomKey: string;
};

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

function requireDraftPath(path: string | null) {
  if (!path) {
    throw new Error("Draft was not found or has already moved");
  }

  if (!path.includes(`${sep}drafts${sep}`)) {
    throw new Error("Refusing to modify non-draft file");
  }

  return path;
}

function yamlScalar(value: string | number | boolean) {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

function replaceDraftBody(content: string, text: string) {
  const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/);

  if (!match?.[1]) {
    throw new Error("Draft is missing frontmatter");
  }

  return `${match[1]}${text.trim()}\n`;
}

function addRejectMetadata(content: string, futureNote: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match?.[1]) {
    throw new Error("Draft is missing frontmatter");
  }

  const metadata = [
    match[1].trimEnd(),
    `rejected: ${yamlScalar(true)}`,
    `rejected_at: ${yamlScalar(new Date().toISOString())}`,
    `rules_review_status: ${yamlScalar(futureNote ? "pending_llm_review" : "not_requested")}`,
  ];

  if (futureNote) {
    metadata.push(`future_rules_note: ${yamlScalar(futureNote)}`);
  }

  return `---\n${metadata.join("\n")}\n---\n${(match[2] ?? "").trim()}\n`;
}

function contextSafeguardViolation(content: string) {
  const { meta } = parseFrontmatter(content);

  if (meta.get("context_reply_posture") === "do_not_reply") {
    return "Context marks this draft as do_not_reply. Approve again with an explicit override to queue it.";
  }

  return null;
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

function readChatContextInput(chatId: string, targetIdentifier: string): ChatContextInput {
  const input: ChatContextInput = {
    contactKeys: targetIdentifier ? [targetIdentifier] : [],
    roomKey: chatId,
  };
  const databasePath = resolveImessageDatabasePath();

  if (!existsSync(databasePath)) {
    return input;
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const chat = sqlite.prepare("SELECT identifier FROM chats WHERE id = ?").get(chatId) as
      | { identifier?: string }
      | undefined;
    const matches = sqlite
      .prepare(
        `SELECT contact_id
        FROM chat_contact_matches
        WHERE chat_id = ?
          AND status = 'matched'
          AND contact_id IS NOT NULL`,
      )
      .all(chatId) as Array<{ contact_id?: string }>;
    const contactKeys = new Set(input.contactKeys);

    if (chat?.identifier) {
      contactKeys.add(chat.identifier);
    }

    for (const match of matches) {
      if (match.contact_id) {
        contactKeys.add(match.contact_id);
      }
    }

    return {
      contactKeys: [...contactKeys],
      roomKey: chatId,
    };
  } finally {
    sqlite.close();
  }
}

function currentSignature(tenantId: string | undefined, chatId: string, targetIdentifier: string) {
  if (!tenantId) {
    return "";
  }

  return new ContextService()
    .resolve({
      channelId: "imessage",
      ...readChatContextInput(chatId, targetIdentifier),
      tenantId,
    })
    .effective.signature.trim();
}

function bodyWithSignature(body: string, signature: string) {
  const trimmedBody = body.trim();
  const trimmedSignature = signature.trim();

  if (!trimmedSignature || trimmedBody.endsWith(trimmedSignature)) {
    return `${trimmedBody}\n`;
  }

  return `${trimmedBody}\n\n${trimmedSignature}\n`;
}

function writeOutboxContent(content: string, options: ApproveImessageDraftOptions = {}) {
  const { body, meta } = parseFrontmatter(content);
  const outboxMeta = new Map<string, string | number | boolean>();
  const uuid = meta.get("uuid");
  const chatId = meta.get("chat_id");

  if (!uuid || !chatId || !body) {
    throw new Error("Draft is missing required send fields");
  }

  outboxMeta.set("uuid", uuid);
  const numericChatId = Number(chatId);
  const targetIdentifier = meta.get("target_identifier") ?? "";
  const signature =
    currentSignature(options.tenantId ?? meta.get("context_tenant_id"), chatId, targetIdentifier) ||
    (meta.get("context_signature") ?? "");

  outboxMeta.set("chat_id", numericChatId);
  outboxMeta.set("target_identifier", targetIdentifier);
  outboxMeta.set("created_at", meta.get("created_at") ?? new Date().toISOString());
  outboxMeta.set("source_draft_uuid", uuid);
  outboxMeta.set("reasoning", meta.get("reasoning") ?? "");
  outboxMeta.set("auto_approved", meta.get("auto_approved") === "true");
  outboxMeta.set("context_signature", signature);

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

  for (const key of [
    "context_tenant_id",
    "contact_context_ids",
    "conversation_context_id",
    "context_version_ids",
    "context_tone",
    "context_reply_posture",
    "context_allowed_personal_details",
    "context_custom_personal_details",
  ]) {
    const value = meta.get(key);

    if (value) {
      outboxMeta.set(key, value);
    }
  }

  const frontmatter = [...outboxMeta]
    .map(([key, value]) => `${key}: ${yamlScalar(value)}`)
    .join("\n");

  return `---\n${frontmatter}\n---\n${bodyWithSignature(body, signature)}`;
}

async function atomicWrite(path: string, content: string) {
  const tmpPath = `${path}.tmp`;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, path);
}

function outboxPathFor(uuid: string) {
  return join(resolveImessageDataPath(), "outbox", `${uuid}.md`);
}

function rejectedPathFor(uuid: string) {
  return join(resolveImessageDataPath(), "rejected", `${uuid}.md`);
}

export async function updateImessageDraft(uuid: string, text: string): Promise<DraftActionResult> {
  const draftPath = requireDraftPath(await findDraftPath(resolveImessageChatsPath(), uuid));

  await atomicWrite(draftPath, replaceDraftBody(await readFile(draftPath, "utf8"), text));

  return {
    draftPath,
    uuid,
  };
}

export async function approveImessageDraft(
  uuid: string,
  options: ApproveImessageDraftOptions = {},
): Promise<DraftActionResult> {
  const outboxPath = outboxPathFor(uuid);
  const draftPath = await findDraftPath(resolveImessageChatsPath(), uuid);

  if (existsSync(outboxPath)) {
    if (draftPath) {
      await unlink(requireDraftPath(draftPath));
    }

    return {
      alreadyCompleted: true,
      draftPath: draftPath ?? "",
      outboxPath,
      uuid,
    };
  }

  const requiredDraftPath = requireDraftPath(draftPath);
  const content = await readFile(requiredDraftPath, "utf8");
  const violation = contextSafeguardViolation(content);

  if (violation && !options.overrideContextSafeguards) {
    throw new Error(violation);
  }

  await atomicWrite(outboxPath, writeOutboxContent(content, options));
  await unlink(requiredDraftPath);

  return {
    draftPath: requiredDraftPath,
    outboxPath,
    uuid,
  };
}

export async function rejectImessageDraft(
  uuid: string,
  futureNote: string,
): Promise<DraftActionResult> {
  const draftPath = await findDraftPath(resolveImessageChatsPath(), uuid);
  const rejectedPath = rejectedPathFor(uuid);
  const rulesReviewStatus = futureNote ? "pending_llm_review" : "not_requested";

  if (existsSync(rejectedPath)) {
    if (draftPath) {
      await unlink(requireDraftPath(draftPath));
    }

    return {
      alreadyCompleted: true,
      draftPath: draftPath ?? "",
      rejectedPath,
      rulesReviewStatus,
      uuid,
    };
  }

  const requiredDraftPath = requireDraftPath(draftPath);

  await mkdir(join(resolveImessageDataPath(), "rejected"), { recursive: true });
  await atomicWrite(
    requiredDraftPath,
    addRejectMetadata(await readFile(requiredDraftPath, "utf8"), futureNote),
  );
  await rename(requiredDraftPath, rejectedPath);

  return {
    draftPath: requiredDraftPath,
    rejectedPath,
    rulesReviewStatus,
    uuid,
  };
}
