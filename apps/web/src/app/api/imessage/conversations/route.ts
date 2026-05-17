// SPDX-License-Identifier: AGPL-3.0-or-later
import { listImessageConversations } from "@commshub99/adapter-imessage";
import { selfPerspectiveFromUser } from "@commshub99/core";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  const result = listImessageConversations({ self: selfPerspectiveFromUser(auth.session.user) });

  if (result.error) {
    return NextResponse.json(
      {
        conversations: result.conversations,
        error: result.error,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    conversations: result.conversations,
    databasePath: result.databasePath,
  });
}
