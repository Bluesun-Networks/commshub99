// SPDX-License-Identifier: AGPL-3.0-or-later
import { listImessageDrafts } from "@commshub99/adapter-imessage";
import { createDbClient } from "@commshub99/db";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

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

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({
    drafts: await listImessageDrafts({ tenantId: defaultTenantId(auth.session.user.id) }),
  });
}
