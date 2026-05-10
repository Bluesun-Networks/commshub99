// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { tenants } from "./auth.js";

export const contextRelationshipCategories = [
  "family",
  "friend",
  "professional",
  "service",
  "unknown",
] as const;

export const contextTones = ["polite", "warm", "direct", "terse", "avoid_rude"] as const;

export const contextReplyPostures = [
  "do_not_reply",
  "reply_if_needed",
  "usually_reply",
  "always_reply",
] as const;

export const contactContexts = sqliteTable(
  "contact_contexts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactKey: text("contact_key").notNull(),
    displayName: text("display_name").notNull().default(""),
    relationship: text("relationship", { enum: contextRelationshipCategories })
      .notNull()
      .default("unknown"),
    tone: text("tone", { enum: contextTones }).notNull().default("warm"),
    replyPosture: text("reply_posture", { enum: contextReplyPostures })
      .notNull()
      .default("reply_if_needed"),
    customPrompt: text("custom_prompt").notNull().default(""),
    notes: text("notes").notNull().default(""),
    allowedPersonalDetailsJson: text("allowed_personal_details_json").notNull().default("[]"),
    customPersonalDetailsJson: text("custom_personal_details_json").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("contact_contexts_tenant_contact_key_unique").on(table.tenantId, table.contactKey),
    index("contact_contexts_tenant_relationship_idx").on(table.tenantId, table.relationship),
  ],
);

export const conversationContexts = sqliteTable(
  "conversation_contexts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    roomKey: text("room_key").notNull(),
    displayName: text("display_name").notNull().default(""),
    relationship: text("relationship", { enum: contextRelationshipCategories })
      .notNull()
      .default("unknown"),
    tone: text("tone", { enum: contextTones }).notNull().default("warm"),
    replyPosture: text("reply_posture", { enum: contextReplyPostures })
      .notNull()
      .default("reply_if_needed"),
    customPrompt: text("custom_prompt").notNull().default(""),
    notes: text("notes").notNull().default(""),
    allowedPersonalDetailsJson: text("allowed_personal_details_json").notNull().default("[]"),
    customPersonalDetailsJson: text("custom_personal_details_json").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("conversation_contexts_tenant_room_unique").on(
      table.tenantId,
      table.channelId,
      table.roomKey,
    ),
    index("conversation_contexts_tenant_channel_idx").on(table.tenantId, table.channelId),
  ],
);

export type ContactContext = typeof contactContexts.$inferSelect;
export type ConversationContext = typeof conversationContexts.$inferSelect;
