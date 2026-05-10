// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from "node:crypto";
import { createDbClient } from "@commshub99/db";

export interface WriteAuditLogInput {
  action: string;
  payload?: Record<string, unknown>;
  targetId: string;
  targetType: string;
  tenantId?: string | null;
  userId?: string | null;
}

export type TryWriteAuditLogResult =
  | {
      createdAt: Date;
      id: string;
      ok: true;
      tenantId: string;
    }
  | {
      error: Error;
      ok: false;
    };

export type DraftMutationAuditAction =
  | "draft.approve"
  | "draft.edit"
  | "draft.reject"
  | "draft.schedule"
  | "draft.schedule.cancel";

export interface WriteDraftMutationAuditInput {
  action: DraftMutationAuditAction;
  draftId: string;
  payload?: Record<string, unknown>;
  tenantId?: string | null;
  userId?: string | null;
}

function resolveTenantId(userId: string | null | undefined, explicitTenantId?: string | null) {
  if (explicitTenantId) {
    return explicitTenantId;
  }

  const client = createDbClient();

  try {
    if (userId) {
      const membership = client.sqlite
        .prepare("SELECT tenant_id AS tenantId FROM tenant_users WHERE user_id = ? LIMIT 1")
        .get(userId) as { tenantId?: string } | undefined;

      if (membership?.tenantId) {
        return membership.tenantId;
      }
    }

    const tenant = client.sqlite.prepare("SELECT id FROM tenants LIMIT 1").get() as
      | { id?: string }
      | undefined;

    return tenant?.id ?? null;
  } finally {
    client.close();
  }
}

export function writeAuditLog(input: WriteAuditLogInput) {
  const tenantId = resolveTenantId(input.userId, input.tenantId);

  if (!tenantId) {
    throw new Error("Cannot write audit log without a tenant.");
  }

  const client = createDbClient();

  try {
    const id = randomUUID();
    const createdAt = new Date();

    client.sqlite
      .prepare(
        `INSERT INTO audit_log (
          id,
          tenant_id,
          user_id,
          action,
          target_type,
          target_id,
          payload_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        tenantId,
        input.userId ?? null,
        input.action,
        input.targetType,
        input.targetId,
        JSON.stringify(input.payload ?? {}),
        createdAt.getTime(),
      );

    return {
      id,
      createdAt,
      tenantId,
    };
  } finally {
    client.close();
  }
}

export function tryWriteAuditLog(input: WriteAuditLogInput): TryWriteAuditLogResult {
  try {
    return {
      ok: true,
      ...writeAuditLog(input),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error("Could not write audit log"),
      ok: false,
    };
  }
}

export function writeDraftMutationAudit(input: WriteDraftMutationAuditInput) {
  return writeAuditLog({
    action: input.action,
    payload: input.payload ?? {},
    targetId: input.draftId,
    targetType: "imessage_draft",
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
  });
}

export function tryWriteDraftMutationAudit(
  input: WriteDraftMutationAuditInput,
): TryWriteAuditLogResult {
  try {
    return {
      ok: true,
      ...writeDraftMutationAudit(input),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error("Could not write draft audit log"),
      ok: false,
    };
  }
}
