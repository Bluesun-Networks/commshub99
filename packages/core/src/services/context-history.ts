// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from "node:crypto";
import { createDbClient } from "@commshub99/db";
import type {
  ContextHistoryOperation,
  ContextHistorySource,
  ContextReviewStatus,
  ContextType,
  ContextVersion,
} from "../types.js";

export interface RecordContextVersionInput {
  actorUserId?: string | null;
  after?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  confidence?: number | null;
  contextId: string;
  contextType: ContextType;
  id?: string;
  operation: ContextHistoryOperation;
  reviewStatus?: ContextReviewStatus;
  source?: ContextHistorySource;
  tenantId: string;
}

export interface ListContextVersionsInput {
  contextId?: string;
  contextType?: ContextType;
  reviewStatus?: ContextReviewStatus;
  tenantId: string;
}

function parseJsonObject(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = JSON.parse(value) as unknown;

  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function rowToContextVersion(row: Record<string, unknown>): ContextVersion {
  return {
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    after: parseJsonObject(row.after_json),
    before: parseJsonObject(row.before_json),
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    contextId: String(row.context_id),
    contextType: row.context_type as ContextType,
    createdAt: new Date(row.created_at as number).toISOString(),
    id: String(row.id),
    operation: row.operation as ContextHistoryOperation,
    reviewStatus: row.review_status as ContextReviewStatus,
    source: row.source as ContextHistorySource,
    tenantId: String(row.tenant_id),
  };
}

function valueFrom(payload: Record<string, unknown>, snakeKey: string, camelKey: string) {
  return payload[snakeKey] ?? payload[camelKey];
}

function textValue(payload: Record<string, unknown>, snakeKey: string, camelKey: string) {
  const value = valueFrom(payload, snakeKey, camelKey);

  return typeof value === "string" ? value : "";
}

function timestampValue(payload: Record<string, unknown>, snakeKey: string, camelKey: string) {
  const value = valueFrom(payload, snakeKey, camelKey);

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const time = new Date(value).getTime();

    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return Date.now();
}

function jsonTextValue(payload: Record<string, unknown>, snakeKey: string, camelKey: string) {
  const value = valueFrom(payload, snakeKey, camelKey);

  return typeof value === "string" ? value : JSON.stringify(value ?? []);
}

function currentContextPayload(contextType: ContextType, contextId: string) {
  const client = createDbClient();

  try {
    const tableName = contextType === "contact" ? "contact_contexts" : "conversation_contexts";

    return client.sqlite.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(contextId) as
      | Record<string, unknown>
      | undefined;
  } finally {
    client.close();
  }
}

function deleteContext(contextType: ContextType, contextId: string) {
  const client = createDbClient();

  try {
    const tableName = contextType === "contact" ? "contact_contexts" : "conversation_contexts";

    client.sqlite.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(contextId);
  } finally {
    client.close();
  }
}

function restoreContactContext(payload: Record<string, unknown>) {
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
        ON CONFLICT(id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          contact_key = excluded.contact_key,
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
        textValue(payload, "id", "id"),
        textValue(payload, "tenant_id", "tenantId"),
        textValue(payload, "contact_key", "contactKey"),
        textValue(payload, "display_name", "displayName"),
        textValue(payload, "relationship", "relationship") || "unknown",
        textValue(payload, "tone", "tone") || "warm",
        textValue(payload, "reply_posture", "replyPosture") || "reply_if_needed",
        textValue(payload, "custom_prompt", "customPrompt"),
        textValue(payload, "notes", "notes"),
        jsonTextValue(payload, "allowed_personal_details_json", "allowedPersonalDetails"),
        jsonTextValue(payload, "custom_personal_details_json", "customPersonalDetails"),
        timestampValue(payload, "created_at", "createdAt"),
        timestampValue(payload, "updated_at", "updatedAt"),
      );
  } finally {
    client.close();
  }
}

function restoreConversationContext(payload: Record<string, unknown>) {
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
        ON CONFLICT(id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          channel_id = excluded.channel_id,
          room_key = excluded.room_key,
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
        textValue(payload, "id", "id"),
        textValue(payload, "tenant_id", "tenantId"),
        textValue(payload, "channel_id", "channelId"),
        textValue(payload, "room_key", "roomKey"),
        textValue(payload, "display_name", "displayName"),
        textValue(payload, "relationship", "relationship") || "unknown",
        textValue(payload, "tone", "tone") || "warm",
        textValue(payload, "reply_posture", "replyPosture") || "reply_if_needed",
        textValue(payload, "custom_prompt", "customPrompt"),
        textValue(payload, "notes", "notes"),
        jsonTextValue(payload, "allowed_personal_details_json", "allowedPersonalDetails"),
        jsonTextValue(payload, "custom_personal_details_json", "customPersonalDetails"),
        timestampValue(payload, "created_at", "createdAt"),
        timestampValue(payload, "updated_at", "updatedAt"),
      );
  } finally {
    client.close();
  }
}

function restoreContext(contextType: ContextType, payload: Record<string, unknown> | null) {
  if (!payload) {
    return;
  }

  if (contextType === "contact") {
    restoreContactContext(payload);
  } else {
    restoreConversationContext(payload);
  }
}

export class ContextHistoryService {
  record(input: RecordContextVersionInput) {
    const client = createDbClient();
    const id = input.id ?? randomUUID();
    const createdAt = new Date();

    try {
      client.sqlite
        .prepare(
          `INSERT INTO context_versions (
            id,
            tenant_id,
            context_type,
            context_id,
            operation,
            actor_user_id,
            before_json,
            after_json,
            source,
            confidence,
            review_status,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.tenantId,
          input.contextType,
          input.contextId,
          input.operation,
          input.actorUserId ?? null,
          input.before ? JSON.stringify(input.before) : null,
          input.after ? JSON.stringify(input.after) : null,
          input.source ?? "human",
          input.confidence ?? null,
          input.reviewStatus ?? "approved",
          createdAt.getTime(),
        );

      return this.get(id);
    } finally {
      client.close();
    }
  }

  get(id: string) {
    const client = createDbClient();

    try {
      const row = client.sqlite.prepare("SELECT * FROM context_versions WHERE id = ?").get(id) as
        | Record<string, unknown>
        | undefined;

      return row ? rowToContextVersion(row) : null;
    } finally {
      client.close();
    }
  }

  list(input: ListContextVersionsInput) {
    const filters = ["tenant_id = ?"];
    const params: string[] = [input.tenantId];

    if (input.contextType) {
      filters.push("context_type = ?");
      params.push(input.contextType);
    }

    if (input.contextId) {
      filters.push("context_id = ?");
      params.push(input.contextId);
    }

    if (input.reviewStatus) {
      filters.push("review_status = ?");
      params.push(input.reviewStatus);
    }

    const client = createDbClient();

    try {
      const rows = client.sqlite
        .prepare(
          `SELECT *
          FROM context_versions
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC`,
        )
        .all(...params) as Record<string, unknown>[];

      return rows.map(rowToContextVersion);
    } finally {
      client.close();
    }
  }

  setReviewStatus(id: string, reviewStatus: ContextReviewStatus) {
    const client = createDbClient();

    try {
      client.sqlite
        .prepare("UPDATE context_versions SET review_status = ? WHERE id = ?")
        .run(reviewStatus, id);

      return this.get(id);
    } finally {
      client.close();
    }
  }

  supersede(id: string) {
    return this.setReviewStatus(id, "superseded");
  }

  rollback(versionId: string, actorUserId?: string | null) {
    const version = this.get(versionId);

    if (!version) {
      throw new Error("Context version was not found");
    }

    const current = currentContextPayload(version.contextType, version.contextId) ?? null;

    if (version.before) {
      restoreContext(version.contextType, version.before);
    } else {
      deleteContext(version.contextType, version.contextId);
    }

    this.supersede(versionId);

    return this.record({
      actorUserId: actorUserId ?? null,
      after: version.before,
      before: current,
      contextId: version.contextId,
      contextType: version.contextType,
      operation: "rollback",
      reviewStatus: "approved",
      source: "human",
      tenantId: version.tenantId,
    });
  }
}
