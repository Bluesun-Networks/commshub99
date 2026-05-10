// SPDX-License-Identifier: AGPL-3.0-or-later
import { ScheduleService } from "@commshub99/core";
import { createDbClient } from "@commshub99/db";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest, requirePermissionRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateSchedulePayload = {
  sendAt?: string;
  uuid?: string;
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

function serializeSchedule(schedule: ReturnType<ScheduleService["listActive"]>[number]) {
  return {
    ...schedule,
    createdAt: schedule.createdAt.toISOString(),
    sendAt: schedule.sendAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({
    schedules: new ScheduleService().listActive().map(serializeSchedule),
  });
}

export async function POST(request: Request) {
  const auth = requirePermissionRequest(request, "drafts:schedule");

  if (auth.response) {
    return auth.response;
  }

  const payload = (await request.json()) as CreateSchedulePayload;
  const uuid = payload.uuid?.trim();
  const sendAt = new Date(payload.sendAt ?? "");

  if (!uuid) {
    return NextResponse.json({ error: "Draft UUID is required" }, { status: 400 });
  }

  if (Number.isNaN(sendAt.getTime())) {
    return NextResponse.json({ error: "Schedule time is required" }, { status: 400 });
  }

  if (sendAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Schedule time must be in the future" }, { status: 400 });
  }

  const schedule = new ScheduleService().create({
    channelId: "imessage",
    draftId: `imessage:draft:${uuid}`,
    requestedByUserId: auth.session.user.id,
    sendAt,
    tenantId: defaultTenantId(auth.session.user.id),
  });

  return NextResponse.json({
    schedule: schedule ? serializeSchedule(schedule) : null,
  });
}
