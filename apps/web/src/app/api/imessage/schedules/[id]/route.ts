// SPDX-License-Identifier: AGPL-3.0-or-later
import { ScheduleService } from "@commshub99/core";
import { NextResponse } from "next/server";
import { requirePermissionRequest } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermissionRequest(_request, "schedules:manage");

  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const schedule = new ScheduleService().cancel(id);

  if (!schedule) {
    return NextResponse.json({ error: "Schedule was not found" }, { status: 404 });
  }

  return NextResponse.json({
    schedule: {
      ...schedule,
      createdAt: schedule.createdAt.toISOString(),
      sendAt: schedule.sendAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    },
  });
}
