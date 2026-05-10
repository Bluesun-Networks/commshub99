// SPDX-License-Identifier: AGPL-3.0-or-later
import { approveImessageDraft } from "@commshub99/adapter-imessage";
import { NextResponse } from "next/server";
import { writeRouteDraftMutationAudit } from "../../../../_audit";
import { requirePermissionRequest } from "../../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = requirePermissionRequest(request, "drafts:approve");

  if (auth.response) {
    return auth.response;
  }

  const { uuid } = await params;

  try {
    const result = await approveImessageDraft(uuid);

    writeRouteDraftMutationAudit({
      action: "draft.approve",
      draftId: uuid,
      payload: {
        alreadyCompleted: result.alreadyCompleted ?? false,
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
