// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeAuditLog } from "@commshub99/core";
import { NextResponse } from "next/server";
import { requirePermissionRequest } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftUpdatePayload = {
  text?: string;
};

type DraftRejectPayload = {
  futureNote?: string;
};

function resolveChatsPath() {
  const dataDir = process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
  return join(dataDir, "chats");
}

function resolveDataPath() {
  return process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
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

function replaceDraftBody(content: string, text: string) {
  const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/);

  if (!match?.[1]) {
    throw new Error("Draft is missing frontmatter");
  }

  return `${match[1]}${text.trim()}\n`;
}

function yamlScalar(value: string | number | boolean) {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
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

function rejectedPathFor(uuid: string) {
  return join(resolveDataPath(), "rejected", `${uuid}.md`);
}

async function atomicWrite(path: string, content: string) {
  const tmpPath = `${path}.tmp`;

  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, path);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = requirePermissionRequest(request, "drafts:edit");

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

  const payload = (await request.json()) as DraftUpdatePayload;
  const text = payload.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "Draft text is required" }, { status: 400 });
  }

  const content = await readFile(draftPath, "utf8");
  await atomicWrite(draftPath, replaceDraftBody(content, text));
  writeAuditLog({
    action: "draft.edit",
    payload: {
      path: draftPath,
      textLength: text.length,
    },
    targetId: uuid,
    targetType: "imessage_draft",
    userId: auth.session.user.id,
  });

  return NextResponse.json({
    status: "updated",
    uuid,
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = requirePermissionRequest(request, "drafts:reject");

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

  const payload = request.headers.get("content-type")?.includes("application/json")
    ? ((await request.json()) as DraftRejectPayload)
    : {};
  const futureNote = payload.futureNote?.trim() ?? "";
  const rejectedPath = rejectedPathFor(uuid);

  await mkdir(join(resolveDataPath(), "rejected"), { recursive: true });
  await atomicWrite(draftPath, addRejectMetadata(await readFile(draftPath, "utf8"), futureNote));
  await rename(draftPath, rejectedPath);
  writeAuditLog({
    action: "draft.reject",
    payload: {
      futureNoteLength: futureNote.length,
      path: draftPath,
      rejectedPath,
      rulesReviewStatus: futureNote ? "pending_llm_review" : "not_requested",
    },
    targetId: uuid,
    targetType: "imessage_draft",
    userId: auth.session.user.id,
  });

  return NextResponse.json({
    rulesReviewStatus: futureNote ? "pending_llm_review" : "not_requested",
    status: "rejected",
    uuid,
  });
}
