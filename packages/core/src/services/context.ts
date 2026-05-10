// SPDX-License-Identifier: AGPL-3.0-or-later
import { createDbClient } from "@commshub99/db";
import type {
  ChannelId,
  ContactContext,
  ContextProfile,
  ContextReplyPosture,
  ConversationContext,
  PersonalDetailBoundary,
} from "../types.js";

export interface ResolveContextInput {
  channelId: ChannelId;
  contactKeys: string[];
  roomKey: string;
  tenantId: string;
}

export interface ResolvedContextBundle {
  contactContexts: ContactContext[];
  conversationContext: ConversationContext | null;
  effective: {
    allowedPersonalDetails: PersonalDetailBoundary[];
    customPersonalDetails: string[];
    customPrompt: string;
    notes: string;
    replyPosture: ContextReplyPosture;
    tone: ContextProfile["tone"];
  };
  tenantId: string;
}

const replyPostureRank: Record<ContextReplyPosture, number> = {
  do_not_reply: 0,
  reply_if_needed: 1,
  usually_reply: 2,
  always_reply: 3,
};

function parseJsonArray(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;

  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function timestampIso(value: unknown) {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(0).toISOString();
}

function rowToContactContext(row: Record<string, unknown>): ContactContext {
  return {
    allowedPersonalDetails: parseJsonArray(
      row.allowed_personal_details_json,
    ) as PersonalDetailBoundary[],
    contactKey: String(row.contact_key),
    customPersonalDetails: parseJsonArray(row.custom_personal_details_json),
    customPrompt: String(row.custom_prompt ?? ""),
    displayName: String(row.display_name ?? ""),
    id: String(row.id),
    notes: String(row.notes ?? ""),
    relationship: row.relationship as ContactContext["relationship"],
    replyPosture: row.reply_posture as ContextReplyPosture,
    scope: "contact",
    tenantId: String(row.tenant_id),
    tone: row.tone as ContactContext["tone"],
    updatedAt: timestampIso(row.updated_at),
  };
}

function rowToConversationContext(row: Record<string, unknown>): ConversationContext {
  return {
    allowedPersonalDetails: parseJsonArray(
      row.allowed_personal_details_json,
    ) as PersonalDetailBoundary[],
    channelId: row.channel_id as ChannelId,
    customPersonalDetails: parseJsonArray(row.custom_personal_details_json),
    customPrompt: String(row.custom_prompt ?? ""),
    displayName: String(row.display_name ?? ""),
    id: String(row.id),
    notes: String(row.notes ?? ""),
    relationship: row.relationship as ConversationContext["relationship"],
    replyPosture: row.reply_posture as ContextReplyPosture,
    roomKey: String(row.room_key),
    scope: "conversation",
    tenantId: String(row.tenant_id),
    tone: row.tone as ConversationContext["tone"],
    updatedAt: timestampIso(row.updated_at),
  };
}

function mostRestrictiveReplyPosture(contexts: ContextProfile[]) {
  return contexts.reduce<ContextReplyPosture>((current, context) => {
    return replyPostureRank[context.replyPosture] < replyPostureRank[current]
      ? context.replyPosture
      : current;
  }, "always_reply");
}

function intersection(values: string[][]) {
  const populated = values.filter((items) => items.length > 0);

  if (populated.length === 0) {
    return [];
  }

  return [...new Set(populated[0])].filter((item) =>
    populated.every((items) => items.includes(item)),
  );
}

function effectiveTone(contexts: ContextProfile[]) {
  if (contexts.some((context) => context.tone === "avoid_rude")) {
    return "avoid_rude";
  }

  return contexts[0]?.tone ?? "warm";
}

function joinedText(contexts: ContextProfile[], key: "customPrompt" | "notes") {
  return contexts
    .map((context) => context[key].trim())
    .filter(Boolean)
    .join("\n\n");
}

export class ContextService {
  resolve(input: ResolveContextInput): ResolvedContextBundle {
    const client = createDbClient();

    try {
      const contactKeys = [
        ...new Set(input.contactKeys.map((key) => key.trim()).filter(Boolean)),
      ].sort();
      const contactContexts =
        contactKeys.length > 0
          ? (
              client.sqlite
                .prepare(
                  `SELECT *
                FROM contact_contexts
                WHERE tenant_id = ?
                  AND contact_key IN (${contactKeys.map(() => "?").join(",")})
                ORDER BY contact_key ASC`,
                )
                .all(input.tenantId, ...contactKeys) as Record<string, unknown>[]
            ).map(rowToContactContext)
          : [];
      const conversationRow = client.sqlite
        .prepare(
          `SELECT *
          FROM conversation_contexts
          WHERE tenant_id = ?
            AND channel_id = ?
            AND room_key = ?
          LIMIT 1`,
        )
        .get(input.tenantId, input.channelId, input.roomKey) as Record<string, unknown> | undefined;
      const conversationContext = conversationRow
        ? rowToConversationContext(conversationRow)
        : null;
      const contexts: ContextProfile[] = [
        ...contactContexts,
        ...(conversationContext ? [conversationContext] : []),
      ];

      return {
        contactContexts,
        conversationContext,
        effective: {
          allowedPersonalDetails: intersection(
            contexts.map((context) => context.allowedPersonalDetails),
          ) as PersonalDetailBoundary[],
          customPersonalDetails: intersection(
            contexts.map((context) => context.customPersonalDetails),
          ),
          customPrompt: joinedText(contexts, "customPrompt"),
          notes: joinedText(contexts, "notes"),
          replyPosture: mostRestrictiveReplyPosture(contexts),
          tone: effectiveTone(contexts),
        },
        tenantId: input.tenantId,
      };
    } finally {
      client.close();
    }
  }
}
