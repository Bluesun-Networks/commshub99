// SPDX-License-Identifier: AGPL-3.0-or-later
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tenants, users } from "./auth.js";

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("audit_log_tenant_id_created_at_idx").on(table.tenantId, table.createdAt),
    index("audit_log_user_id_idx").on(table.userId),
    index("audit_log_target_idx").on(table.targetType, table.targetId),
  ],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
