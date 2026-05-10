// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from "node:crypto";
import { harvestImessageContextSuggestions } from "@commshub99/adapter-imessage";
import { ContextHistoryService } from "@commshub99/core";
import { createDbClient } from "@commshub99/db";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest, requirePermissionRequest } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContextScope = "contact" | "conversation";

type ContextPayload = {
  allowedPersonalDetails?: string[];
  channelId?: string;
  contactKey?: string;
  customPersonalDetails?: string[];
  customPrompt?: string;
  displayName?: string;
  id?: string;
  notes?: string;
  relationship?: string;
  replyPosture?: string;
  roomKey?: string;
  scope?: ContextScope;
  tone?: string;
};

function defaultTenantId(userId: string) {
  const client = createDbClient();

  try {
    const membership = client.sqlite
      .prepare("SELECT tenant_id AS tenantId FROM tenant_users WHERE user_id = ? LIMIT 1")
      .get(userId) as { tenantId?: string } | undefined;

    if (membership?.tenantId) {
      return membership.tenantId;
    }

    const tenant = client.sqlite.prepare("SELECT id FROM tenants LIMIT 1").get() as
      | { id?: string }
      | undefined;

    if (!tenant?.id) {
      throw new Error("No tenant exists. Create a local admin user first.");
    }

    return tenant.id;
  } finally {
    client.close();
  }
}

function jsonArray(value: unknown) {
  return JSON.stringify(
    Array.isArray(value) ? value.filter((item) => typeof item === "string") : [],
  );
}

function rows(tableName: "contact_contexts" | "conversation_contexts", tenantId: string) {
  const client = createDbClient();

  try {
    return client.sqlite
      .prepare(`SELECT * FROM ${tableName} WHERE tenant_id = ? ORDER BY display_name ASC`)
      .all(tenantId) as Record<string, unknown>[];
  } finally {
    client.close();
  }
}

function rowById(tableName: "contact_contexts" | "conversation_contexts", id: string) {
  const client = createDbClient();

  try {
    return client.sqlite.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
  } finally {
    client.close();
  }
}

function contactRow(tenantId: string, contactKey: string) {
  const client = createDbClient();

  try {
    return client.sqlite
      .prepare("SELECT * FROM contact_contexts WHERE tenant_id = ? AND contact_key = ?")
      .get(tenantId, contactKey) as Record<string, unknown> | undefined;
  } finally {
    client.close();
  }
}

function conversationRow(tenantId: string, channelId: string, roomKey: string) {
  const client = createDbClient();

  try {
    return client.sqlite
      .prepare(
        "SELECT * FROM conversation_contexts WHERE tenant_id = ? AND channel_id = ? AND room_key = ?",
      )
      .get(tenantId, channelId, roomKey) as Record<string, unknown> | undefined;
  } finally {
    client.close();
  }
}

function normalizeRow(row: Record<string, unknown>) {
  return {
    allowedPersonalDetails: JSON.parse(String(row.allowed_personal_details_json ?? "[]")),
    channelId: row.channel_id ? String(row.channel_id) : undefined,
    contactKey: row.contact_key ? String(row.contact_key) : undefined,
    customPersonalDetails: JSON.parse(String(row.custom_personal_details_json ?? "[]")),
    customPrompt: String(row.custom_prompt ?? ""),
    displayName: String(row.display_name ?? ""),
    id: String(row.id),
    notes: String(row.notes ?? ""),
    relationship: String(row.relationship ?? "unknown"),
    replyPosture: String(row.reply_posture ?? "reply_if_needed"),
    roomKey: row.room_key ? String(row.room_key) : undefined,
    tenantId: String(row.tenant_id),
    tone: String(row.tone ?? "warm"),
    updatedAt: new Date(Number(row.updated_at ?? 0)).toISOString(),
  };
}

function saveContactContext(tenantId: string, payload: ContextPayload) {
  const id = payload.id || randomUUID();
  const now = Date.now();
  const contactKey = payload.contactKey?.trim();

  if (!contactKey) {
    throw new Error("Contact key is required.");
  }

  const before = rowById("contact_contexts", id) ?? contactRow(tenantId, contactKey) ?? null;
  const client = createDbClient();

  try {
    client.sqlite
      .prepare(
        `INSERT INTO contact_contexts (
          id,
          tenant_id,
          contact_key,
          display_name,
          relationship,
          tone,
          reply_posture,
          custom_prompt,
          notes,
          allowed_personal_details_json,
          custom_personal_details_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, contact_key) DO UPDATE SET
          display_name = excluded.display_name,
          relationship = excluded.relationship,
          tone = excluded.tone,
          reply_posture = excluded.reply_posture,
          custom_prompt = excluded.custom_prompt,
          notes = excluded.notes,
          allowed_personal_details_json = excluded.allowed_personal_details_json,
          custom_personal_details_json = excluded.custom_personal_details_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        tenantId,
        contactKey,
        payload.displayName?.trim() ?? "",
        payload.relationship ?? "unknown",
        payload.tone ?? "warm",
        payload.replyPosture ?? "reply_if_needed",
        payload.customPrompt ?? "",
        payload.notes ?? "",
        jsonArray(payload.allowedPersonalDetails),
        jsonArray(payload.customPersonalDetails),
        now,
        now,
      );
  } finally {
    client.close();
  }

  const after = contactRow(tenantId, contactKey) ?? null;

  return { after, before, id: String(after?.id ?? id) };
}

function saveConversationContext(tenantId: string, payload: ContextPayload) {
  const id = payload.id || randomUUID();
  const now = Date.now();
  const channelId = payload.channelId?.trim() || "imessage";
  const roomKey = payload.roomKey?.trim();

  if (!roomKey) {
    throw new Error("Room key is required.");
  }

  const before =
    rowById("conversation_contexts", id) ?? conversationRow(tenantId, channelId, roomKey) ?? null;
  const client = createDbClient();

  try {
    client.sqlite
      .prepare(
        `INSERT INTO conversation_contexts (
          id,
          tenant_id,
          channel_id,
          room_key,
          display_name,
          relationship,
          tone,
          reply_posture,
          custom_prompt,
          notes,
          allowed_personal_details_json,
          custom_personal_details_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, channel_id, room_key) DO UPDATE SET
          display_name = excluded.display_name,
          relationship = excluded.relationship,
          tone = excluded.tone,
          reply_posture = excluded.reply_posture,
          custom_prompt = excluded.custom_prompt,
          notes = excluded.notes,
          allowed_personal_details_json = excluded.allowed_personal_details_json,
          custom_personal_details_json = excluded.custom_personal_details_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        tenantId,
        channelId,
        roomKey,
        payload.displayName?.trim() ?? "",
        payload.relationship ?? "unknown",
        payload.tone ?? "warm",
        payload.replyPosture ?? "reply_if_needed",
        payload.customPrompt ?? "",
        payload.notes ?? "",
        jsonArray(payload.allowedPersonalDetails),
        jsonArray(payload.customPersonalDetails),
        now,
        now,
      );
  } finally {
    client.close();
  }

  const after = conversationRow(tenantId, channelId, roomKey) ?? null;

  return { after, before, id: String(after?.id ?? id) };
}

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  const tenantId = defaultTenantId(auth.session.user.id);
  const harvest = harvestImessageContextSuggestions(20);

  return NextResponse.json({
    contactContexts: rows("contact_contexts", tenantId).map(normalizeRow),
    conversationContexts: rows("conversation_contexts", tenantId).map(normalizeRow),
    harvestError: harvest.error,
    suggestions: harvest.suggestions,
    tenantId,
  });
}

export async function POST(request: Request) {
  const auth = requirePermissionRequest(request, "settings:manage");

  if (auth.response) {
    return auth.response;
  }

  const tenantId = defaultTenantId(auth.session.user.id);
  const payload = (await request.json()) as ContextPayload;

  try {
    const saved =
      payload.scope === "conversation"
        ? saveConversationContext(tenantId, payload)
        : saveContactContext(tenantId, payload);

    new ContextHistoryService().record({
      actorUserId: auth.session.user.id,
      after: saved.after,
      before: saved.before,
      contextId: saved.id,
      contextType: payload.scope === "conversation" ? "conversation" : "contact",
      operation: saved.before ? "update" : "create",
      source: "human",
      tenantId,
    });

    return NextResponse.json({
      context: saved.after ? normalizeRow(saved.after) : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save context" },
      { status: 400 },
    );
  }
}
