// SPDX-License-Identifier: AGPL-3.0-or-later
import { callContactsMcpTool } from "@commshub99/mcp-client";
import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContactPoint = {
  label: string;
  value: string;
};

type ContactPayload = {
  birthday?: string;
  categories?: string[];
  displayName?: string;
  emailPoints?: ContactPoint[];
  familyName?: string;
  givenName?: string;
  notes?: string;
  organizationName?: string;
  organizationTitle?: string;
  phonePoints?: ContactPoint[];
  photoUrl?: string | null;
};

function emailType(label: string) {
  return label === "home" || label === "work" ? label : "other";
}

function phoneType(label: string) {
  return label === "home" || label === "work" || label === "mobile" || label === "fax"
    ? label
    : "other";
}

function contactArgs(payload: ContactPayload) {
  return {
    birthday: payload.birthday || undefined,
    categories: payload.categories,
    emails: payload.emailPoints?.map((point) => ({
      type: emailType(point.label),
      value: point.value,
    })),
    familyName: payload.familyName,
    fullName:
      payload.displayName ||
      [payload.givenName, payload.familyName].filter(Boolean).join(" ") ||
      "Unnamed contact",
    givenName: payload.givenName,
    notes: payload.notes,
    organization:
      payload.organizationName || payload.organizationTitle
        ? {
            name: payload.organizationName || undefined,
            title: payload.organizationTitle || undefined,
          }
        : undefined,
    phones: payload.phonePoints?.map((point) => ({
      type: phoneType(point.label),
      value: point.value,
    })),
    photo: payload.photoUrl || undefined,
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const payload = (await request.json()) as ContactPayload;
    const args = contactArgs(payload);
    const result = id.startsWith("local:")
      ? await callContactsMcpTool<{ id: string; fullName: string }>("create_contact", args)
      : await callContactsMcpTool<{ id: string; fullName: string }>("update_contact", {
          id,
          ...args,
        });

    return NextResponse.json({
      contact: {
        id: result.id,
        fullName: result.fullName,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save contact",
      },
      { status: 500 },
    );
  }
}
