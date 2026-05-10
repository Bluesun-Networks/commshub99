// SPDX-License-Identifier: AGPL-3.0-or-later
import { rejectImessageDraft, updateImessageDraft } from "@commshub99/adapter-imessage";
import { NextResponse } from "next/server";
import { writeRouteDraftMutationAudit } from "../../../_audit";
import { requirePermissionRequest } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftUpdatePayload = {
  text?: string;
};

type DraftRejectPayload = {
  futureNote?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = requirePermissionRequest(request, "drafts:edit");

  if (auth.response) {
    return auth.response;
  }

  const { uuid } = await params;
  const payload = (await request.json()) as DraftUpdatePayload;
  const text = payload.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "Draft text is required" }, { status: 400 });
  }

  try {
    const result = await updateImessageDraft(uuid, text);

    writeRouteDraftMutationAudit({
      action: "draft.edit",
      draftId: uuid,
      payload: {
        path: result.draftPath,
        textLength: text.length,
      },
      userId: auth.session.user.id,
    });

    return NextResponse.json({
      status: "updated",
      uuid,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update draft" },
      { status: error instanceof Error && error.message.includes("not found") ? 404 : 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const auth = requirePermissionRequest(request, "drafts:reject");

  if (auth.response) {
    return auth.response;
  }

  const { uuid } = await params;
  const payload = request.headers.get("content-type")?.includes("application/json")
    ? ((await request.json()) as DraftRejectPayload)
    : {};
  const futureNote = payload.futureNote?.trim() ?? "";

  try {
    const result = await rejectImessageDraft(uuid, futureNote);

    writeRouteDraftMutationAudit({
      action: "draft.reject",
      draftId: uuid,
      payload: {
        alreadyCompleted: result.alreadyCompleted ?? false,
        futureNoteLength: futureNote.length,
        path: result.draftPath,
        rejectedPath: result.rejectedPath,
        rulesReviewStatus: result.rulesReviewStatus,
      },
      userId: auth.session.user.id,
    });

    return NextResponse.json({
      rulesReviewStatus: result.rulesReviewStatus,
      status: "rejected",
      uuid,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reject draft" },
      { status: error instanceof Error && error.message.includes("not found") ? 404 : 400 },
    );
  }
}
