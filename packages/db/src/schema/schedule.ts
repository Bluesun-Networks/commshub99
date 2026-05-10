// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tenants, users } from "./auth.js";

export const scheduledSendStatuses = ["pending", "sending", "sent", "cancelled", "failed"] as const;

export const scheduledSends = sqliteTable(
  "scheduled_sends",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    draftId: text("draft_id").notNull(),
    channelId: text("channel_id").notNull(),
    sendAt: integer("send_at", { mode: "timestamp" }).notNull(),
    status: text("status", { enum: scheduledSendStatuses }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("scheduled_sends_tenant_status_send_at_idx").on(
      table.tenantId,
      table.status,
      table.sendAt,
    ),
    index("scheduled_sends_draft_id_idx").on(table.draftId),
    index("scheduled_sends_requested_by_user_id_idx").on(table.requestedByUserId),
  ],
);

export type ScheduledSend = typeof scheduledSends.$inferSelect;
