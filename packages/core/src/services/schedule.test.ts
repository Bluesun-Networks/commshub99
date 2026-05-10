// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDbClient } from "@commshub99/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDueScheduledSends } from "../workers/schedule.js";
import { ScheduleService } from "./schedule.js";

const originalDbPath = process.env.COMMSHUB99_DB_PATH;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-schedule-"));
  process.env.COMMSHUB99_DB_PATH = join(tempDir, "hub.db");

  const client = createDbClient();

  try {
    client.sqlite.exec(`
      CREATE TABLE users (
        id text PRIMARY KEY NOT NULL,
        email text NOT NULL,
        name text NOT NULL,
        password_hash text NOT NULL,
        role text NOT NULL,
        created_at integer NOT NULL,
        disabled integer NOT NULL
      );
      CREATE TABLE tenants (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        owner_user_id text NOT NULL,
        created_at integer NOT NULL
      );
      CREATE TABLE tenant_users (
        tenant_id text NOT NULL,
        user_id text NOT NULL,
        role text NOT NULL,
        created_at integer NOT NULL,
        PRIMARY KEY (tenant_id, user_id)
      );
      CREATE TABLE scheduled_sends (
        id text PRIMARY KEY NOT NULL,
        tenant_id text NOT NULL,
        draft_id text NOT NULL,
        channel_id text NOT NULL,
        send_at integer NOT NULL,
        status text DEFAULT 'pending' NOT NULL,
        attempts integer DEFAULT 0 NOT NULL,
        last_error text,
        requested_by_user_id text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE TABLE audit_log (
        id text PRIMARY KEY NOT NULL,
        tenant_id text NOT NULL,
        user_id text,
        action text NOT NULL,
        target_type text NOT NULL,
        target_id text NOT NULL,
        payload_json text NOT NULL,
        created_at integer NOT NULL
      );
      INSERT INTO users (id, email, name, password_hash, role, created_at, disabled)
        VALUES ('user-1', 'admin@example.com', 'Admin', 'hash', 'admin', 1, 0);
      INSERT INTO tenants (id, name, owner_user_id, created_at)
        VALUES ('tenant-1', 'Home', 'user-1', 1);
      INSERT INTO tenant_users (tenant_id, user_id, role, created_at)
        VALUES ('tenant-1', 'user-1', 'admin', 1);
    `);
  } finally {
    client.close();
  }
});

afterEach(() => {
  if (originalDbPath === undefined) {
    delete process.env.COMMSHUB99_DB_PATH;
  } else {
    process.env.COMMSHUB99_DB_PATH = originalDbPath;
  }

  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

function createDue(service: ScheduleService, id = "schedule-1") {
  return service.create({
    channelId: "imessage",
    draftId: `imessage:draft:${id}`,
    id,
    requestedByUserId: "user-1",
    sendAt: new Date("2026-05-10T20:00:00Z"),
    tenantId: "tenant-1",
  });
}

function auditRows() {
  const client = createDbClient();

  try {
    return client.sqlite.prepare("SELECT * FROM audit_log ORDER BY rowid ASC").all() as Array<{
      action: string;
      payload_json: string;
      target_id: string;
      target_type: string;
      tenant_id: string;
      user_id: string | null;
    }>;
  } finally {
    client.close();
  }
}

describe("ScheduleService", () => {
  it("audits scheduled draft creation", () => {
    const service = new ScheduleService();

    createDue(service);

    expect(auditRows()).toMatchObject([
      {
        action: "draft.schedule",
        target_id: "imessage:draft:schedule-1",
        target_type: "imessage_draft",
        tenant_id: "tenant-1",
        user_id: "user-1",
      },
    ]);
    expect(JSON.parse(auditRows()[0]?.payload_json ?? "{}")).toMatchObject({
      channelId: "imessage",
      scheduleId: "schedule-1",
      sendAt: "2026-05-10T20:00:00.000Z",
    });
  });

  it("audits scheduled draft cancellation", () => {
    const service = new ScheduleService();

    createDue(service);
    service.cancel("schedule-1");

    expect(auditRows()).toMatchObject([
      {
        action: "draft.schedule",
      },
      {
        action: "draft.schedule.cancel",
        target_id: "imessage:draft:schedule-1",
        target_type: "imessage_draft",
        tenant_id: "tenant-1",
        user_id: "user-1",
      },
    ]);
    expect(JSON.parse(auditRows()[1]?.payload_json ?? "{}")).toEqual({
      scheduleId: "schedule-1",
    });
  });

  it("finds due sends but excludes future and cancelled sends", () => {
    const service = new ScheduleService();

    createDue(service, "due");
    service.create({
      channelId: "imessage",
      draftId: "imessage:draft:future",
      id: "future",
      requestedByUserId: "user-1",
      sendAt: new Date("2026-05-10T22:00:00Z"),
      tenantId: "tenant-1",
    });
    createDue(service, "cancelled");
    service.cancel("cancelled");

    expect(service.listDue(new Date("2026-05-10T21:00:00Z")).map((send) => send.id)).toEqual([
      "due",
    ]);
  });
});

describe("runDueScheduledSends", () => {
  it("approves due sends and marks them sent", async () => {
    const service = new ScheduleService();
    const approved: string[] = [];

    createDue(service);

    const results = await runDueScheduledSends({
      draftService: {
        approve: async (id) => {
          approved.push(id);
          return { id };
        },
      },
      now: new Date("2026-05-10T21:00:00Z"),
      scheduleService: service,
    });

    expect(results).toEqual([{ id: "schedule-1", status: "sent" }]);
    expect(approved).toEqual(["imessage:draft:schedule-1"]);
    expect(service.get("schedule-1")?.status).toBe("sent");
    expect(service.get("schedule-1")?.attempts).toBe(1);
  });

  it("retries failed sends until max attempts", async () => {
    const service = new ScheduleService();
    let shouldFail = true;

    createDue(service);

    await runDueScheduledSends({
      draftService: {
        approve: async () => {
          if (shouldFail) {
            throw new Error("temporary failure");
          }

          return { id: "imessage:draft:schedule-1" };
        },
      },
      maxAttempts: 2,
      now: new Date("2026-05-10T21:00:00Z"),
      scheduleService: service,
    });

    expect(service.get("schedule-1")).toMatchObject({
      attempts: 1,
      lastError: "temporary failure",
      status: "failed",
    });

    shouldFail = false;
    await runDueScheduledSends({
      draftService: {
        approve: async (id) => ({ id }),
      },
      maxAttempts: 2,
      now: new Date("2026-05-10T21:00:00Z"),
      scheduleService: service,
    });

    expect(service.get("schedule-1")).toMatchObject({
      attempts: 2,
      lastError: null,
      status: "sent",
    });
  });

  it("stops retrying once max attempts is reached", async () => {
    const service = new ScheduleService();

    createDue(service);

    for (let index = 0; index < 2; index += 1) {
      await runDueScheduledSends({
        draftService: {
          approve: async () => {
            throw new Error("still failing");
          },
        },
        maxAttempts: 2,
        now: new Date("2026-05-10T21:00:00Z"),
        scheduleService: service,
      });
    }

    const finalRun = await runDueScheduledSends({
      draftService: {
        approve: async (id) => ({ id }),
      },
      maxAttempts: 2,
      now: new Date("2026-05-10T21:00:00Z"),
      scheduleService: service,
    });

    expect(finalRun).toEqual([]);
    expect(service.get("schedule-1")).toMatchObject({
      attempts: 2,
      lastError: "still failing",
      status: "failed",
    });
  });
});
