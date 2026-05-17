// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { tenants, users } from "./auth.js";

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

export const contextTypes = ["contact", "conversation"] as const;
export const contextHistoryOperations = ["create", "update", "delete", "rollback"] as const;
export const contextHistorySources = ["human", "harvest", "import", "system"] as const;
export const contextReviewStatuses = ["pending", "approved", "rejected", "superseded"] as const;
export const contextSignatureModes = ["inherit", "append", "override"] as const;
export const contextDeliveryServices = ["inherit", "auto", "imessage", "sms"] as const;

export const tenantSettings = sqliteTable("tenant_settings", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  signature: text("signature").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

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
    signatureMode: text("signature_mode", { enum: contextSignatureModes })
      .notNull()
      .default("inherit"),
    signatureValue: text("signature_value").notNull().default(""),
    deliveryService: text("delivery_service", { enum: contextDeliveryServices })
      .notNull()
      .default("auto"),
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
    signatureMode: text("signature_mode", { enum: contextSignatureModes })
      .notNull()
      .default("inherit"),
    signatureValue: text("signature_value").notNull().default(""),
    deliveryService: text("delivery_service", { enum: contextDeliveryServices })
      .notNull()
      .default("inherit"),
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

export const contextVersions = sqliteTable(
  "context_versions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contextType: text("context_type", { enum: contextTypes }).notNull(),
    contextId: text("context_id").notNull(),
    operation: text("operation", { enum: contextHistoryOperations }).notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    source: text("source", { enum: contextHistorySources }).notNull().default("human"),
    confidence: real("confidence"),
    reviewStatus: text("review_status", { enum: contextReviewStatuses })
      .notNull()
      .default("approved"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("context_versions_context_idx").on(table.tenantId, table.contextType, table.contextId),
    index("context_versions_review_idx").on(table.tenantId, table.reviewStatus),
    index("context_versions_actor_idx").on(table.actorUserId),
  ],
);

export type ContactContext = typeof contactContexts.$inferSelect;
export type ConversationContext = typeof conversationContexts.$inferSelect;
export type ContextVersion = typeof contextVersions.$inferSelect;
export type TenantSettings = typeof tenantSettings.$inferSelect;
