// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from "node:crypto";
import { createDbClient } from "@commshub99/db";
import type { ChannelId } from "../types.js";

export type ScheduledSendStatus = "pending" | "sending" | "sent" | "cancelled" | "failed";

export type ScheduledSendRecord = {
  attempts: number;
  channelId: ChannelId;
  createdAt: Date;
  draftId: string;
  id: string;
  lastError: string | null;
  requestedByUserId: string | null;
  sendAt: Date;
  status: ScheduledSendStatus;
  tenantId: string;
  updatedAt: Date;
};

export type CreateScheduledSendInput = {
  channelId: ChannelId;
  draftId: string;
  id?: string;
  requestedByUserId?: string | null;
  sendAt: Date;
  tenantId: string;
};

function toDate(value: number | string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function rowToScheduledSend(row: Record<string, unknown>): ScheduledSendRecord {
  return {
    attempts: Number(row.attempts),
    channelId: row.channel_id as ChannelId,
    createdAt: toDate(row.created_at as number),
    draftId: String(row.draft_id),
    id: String(row.id),
    lastError: row.last_error ? String(row.last_error) : null,
    requestedByUserId: row.requested_by_user_id ? String(row.requested_by_user_id) : null,
    sendAt: toDate(row.send_at as number),
    status: row.status as ScheduledSendStatus,
    tenantId: String(row.tenant_id),
    updatedAt: toDate(row.updated_at as number),
  };
}

export class ScheduleService {
  create(input: CreateScheduledSendInput) {
    const client = createDbClient();
    const id = input.id ?? randomUUID();
    const now = new Date();

    try {
      client.sqlite
        .prepare(
          `INSERT INTO scheduled_sends (
            id,
            tenant_id,
            draft_id,
            channel_id,
            send_at,
            status,
            attempts,
            requested_by_user_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
        )
        .run(
          id,
          input.tenantId,
          input.draftId,
          input.channelId,
          input.sendAt.getTime(),
          input.requestedByUserId ?? null,
          now.getTime(),
          now.getTime(),
        );

      return this.get(id);
    } finally {
      client.close();
    }
  }

  get(id: string) {
    const client = createDbClient();

    try {
      const row = client.sqlite.prepare("SELECT * FROM scheduled_sends WHERE id = ?").get(id) as
        | Record<string, unknown>
        | undefined;

      return row ? rowToScheduledSend(row) : null;
    } finally {
      client.close();
    }
  }

  listDue(now = new Date(), maxAttempts = 3) {
    const client = createDbClient();

    try {
      const rows = client.sqlite
        .prepare(
          `SELECT *
          FROM scheduled_sends
          WHERE status IN ('pending', 'failed')
            AND send_at <= ?
            AND attempts < ?
          ORDER BY send_at ASC, created_at ASC`,
        )
        .all(now.getTime(), maxAttempts) as Record<string, unknown>[];

      return rows.map(rowToScheduledSend);
    } finally {
      client.close();
    }
  }

  cancel(id: string) {
    this.updateStatus(id, "cancelled", null);
    return this.get(id);
  }

  markSending(id: string) {
    const client = createDbClient();

    try {
      client.sqlite
        .prepare(
          `UPDATE scheduled_sends
          SET status = 'sending',
            attempts = attempts + 1,
            updated_at = ?
          WHERE id = ?
            AND status IN ('pending', 'failed')`,
        )
        .run(Date.now(), id);

      return this.get(id);
    } finally {
      client.close();
    }
  }

  markSent(id: string) {
    this.updateStatus(id, "sent", null);
    return this.get(id);
  }

  markFailed(id: string, error: string) {
    this.updateStatus(id, "failed", error);
    return this.get(id);
  }

  private updateStatus(id: string, status: ScheduledSendStatus, error: string | null) {
    const client = createDbClient();

    try {
      client.sqlite
        .prepare(
          `UPDATE scheduled_sends
          SET status = ?,
            last_error = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(status, error, Date.now(), id);
    } finally {
      client.close();
    }
  }
}
