// SPDX-License-Identifier: AGPL-3.0-or-later
import { approveImessageDraft } from "@commshub99/adapter-imessage";
import { createDbClient } from "@commshub99/db";
import { NextResponse } from "next/server";
import { writeRouteDraftMutationAudit } from "../../../../_audit";
import { requirePermissionRequest } from "../../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = requirePermissionRequest(request, "drafts:approve");

  if (auth.response) {
    return auth.response;
  }

  const { uuid } = await params;

  try {
    const payload = (await request.json().catch(() => ({}))) as {
      overrideContextSafeguards?: boolean;
    };
    const overrideContextSafeguards = payload.overrideContextSafeguards === true;
    const result = await approveImessageDraft(uuid, {
      overrideContextSafeguards,
      tenantId: defaultTenantId(auth.session.user.id),
    });

    writeRouteDraftMutationAudit({
      action: "draft.approve",
      draftId: uuid,
      payload: {
        alreadyCompleted: result.alreadyCompleted ?? false,
        overrideContextSafeguards,
        outboxPath: result.outboxPath,
        path: result.draftPath,
      },
      userId: auth.session.user.id,
    });

    return NextResponse.json({
      status: "queued",
      uuid,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not approve draft" },
      { status: error instanceof Error && error.message.includes("not found") ? 404 : 400 },
    );
  }
}
