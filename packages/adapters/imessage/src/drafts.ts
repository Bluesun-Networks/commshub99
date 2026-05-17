// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ContextService,
  contextBundleToDraftSnapshot,
  type DraftContextSnapshot,
  type ProposedMessage,
} from "@commshub99/core";
import Database from "better-sqlite3";
import { displayDate } from "./format.js";
import { parseFrontmatter } from "./frontmatter.js";
import { resolveImessageChatsPath, resolveImessageDatabasePath } from "./paths.js";
import { inferredSelfContactIds } from "./perspective.js";

type DraftFile = {
  path: string;
};

export interface ListImessageDraftsOptions {
  tenantId?: string;
}

type ChatContextInput = {
  contactKeys: string[];
  roomKey: string;
};

function stringList(value: string | undefined) {
  if (!value) {
    return [];
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;

      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function contextFromMeta(meta: Map<string, string>, tenantId = ""): DraftContextSnapshot | null {
  const contextVersionIds = stringList(meta.get("context_version_ids"));
  const contactContextIds = stringList(meta.get("contact_context_ids"));
  const conversationContextId = meta.get("conversation_context_id") || null;

  if (contextVersionIds.length === 0 && contactContextIds.length === 0 && !conversationContextId) {
    return null;
  }

  return {
    allowedPersonalDetails: stringList(
      meta.get("context_allowed_personal_details"),
    ) as DraftContextSnapshot["allowedPersonalDetails"],
    contactContextIds,
    contextVersionIds,
    conversationContextId,
    customPersonalDetails: stringList(meta.get("context_custom_personal_details")),
    customPrompt: meta.get("context_custom_prompt") ?? "",
    deliveryService:
      (meta.get("context_delivery_service") as
        | DraftContextSnapshot["deliveryService"]
        | undefined) ?? "auto",
    notes: meta.get("context_notes") ?? "",
    replyPosture:
      (meta.get("context_reply_posture") as DraftContextSnapshot["replyPosture"] | undefined) ??
      "reply_if_needed",
    signature: meta.get("context_signature") ?? "",
    source: "draft_metadata",
    tenantId: meta.get("context_tenant_id") ?? tenantId,
    tone: (meta.get("context_tone") as DraftContextSnapshot["tone"] | undefined) ?? "warm",
  };
}

function parseDraft(
  filePath: string,
  content: string,
  sourceMessageAt = "",
  context: DraftContextSnapshot | null = null,
) {
  const { body, meta } = parseFrontmatter(content);
  const createdAt = meta.get("created_at") ?? "";
  const chatId = meta.get("chat_id") ?? (filePath.match(/\/chats\/([^/]+)\//)?.[1] || "");
  const uuid = meta.get("uuid") ?? (filePath.split("/").at(-1)?.replace(/\.md$/, "") || "");
  const sourceRowid = Number(meta.get("source_rowid"));

  return {
    approved: meta.get("approved") === "true",
    chatId,
    context,
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

function readChatContextInputs(drafts: ProposedMessage[]) {
  const databasePath = resolveImessageDatabasePath();
  const chatIds = [...new Set(drafts.map((draft) => draft.chatId).filter(Boolean))];
  const inputs = new Map<string, ChatContextInput>();

  for (const chatId of chatIds) {
    inputs.set(chatId, { contactKeys: [], roomKey: chatId });
  }

  if (chatIds.length === 0 || !existsSync(databasePath)) {
    return inputs;
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const chatStatement = sqlite.prepare("SELECT identifier FROM chats WHERE id = ?");
    const matchStatement = sqlite.prepare(
      `SELECT contact_id
      FROM chat_contact_matches
      WHERE chat_id = ?
        AND status = 'matched'
        AND contact_id IS NOT NULL`,
    );
    const selfContactIds = new Set(inferredSelfContactIds(sqlite));

    for (const draft of drafts) {
      const input = inputs.get(draft.chatId);

      if (!input) {
        continue;
      }

      const chat = chatStatement.get(draft.chatId) as { identifier?: string } | undefined;
      const matches = matchStatement.all(draft.chatId) as Array<{ contact_id?: string }>;
      const contactKeys = new Set(input.contactKeys);

      if (draft.targetIdentifier) {
        contactKeys.add(draft.targetIdentifier);
      }

      if (chat?.identifier) {
        contactKeys.add(chat.identifier);
      }

      for (const match of matches) {
        if (match.contact_id && !selfContactIds.has(match.contact_id.toLowerCase())) {
          contactKeys.add(match.contact_id);
        }
      }

      input.contactKeys = [...contactKeys];
    }
  } finally {
    sqlite.close();
  }

  return inputs;
}

function resolveLiveContext(tenantId: string, input?: ChatContextInput) {
  if (!input) {
    return null;
  }

  const bundle = new ContextService().resolve({
    channelId: "imessage",
    contactKeys: input.contactKeys,
    roomKey: input.roomKey,
    tenantId,
  });

  if (bundle.contextProfileIds.length === 0) {
    return null;
  }

  return contextBundleToDraftSnapshot(bundle, "live");
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

export async function listImessageDrafts(
  options: ListImessageDraftsOptions = {},
): Promise<ProposedMessage[]> {
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
  const chatContextInputs = options.tenantId ? readChatContextInputs(preliminaryDrafts) : null;
  const drafts = draftContents.map(({ content, file }, index) => {
    const preliminaryDraft = preliminaryDrafts[index];
    const sourceRowid = preliminaryDraft?.sourceRowid;
    const metadataContext = contextFromMeta(parseFrontmatter(content).meta, options.tenantId);
    const liveContext =
      !metadataContext && options.tenantId && preliminaryDraft
        ? resolveLiveContext(options.tenantId, chatContextInputs?.get(preliminaryDraft.chatId))
        : null;

    return parseDraft(
      file.path,
      content,
      typeof sourceRowid === "number" ? (sourceMessageDates.get(sourceRowid) ?? "") : "",
      metadataContext ?? liveContext,
    );
  });

  drafts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return drafts.slice(0, 100);
}
