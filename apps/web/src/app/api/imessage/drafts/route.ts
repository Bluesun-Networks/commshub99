// SPDX-License-Identifier: AGPL-3.0-or-later
import { listImessageDrafts } from "@commshub99/adapter-imessage";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({
    drafts: await listImessageDrafts(),
  });
}
