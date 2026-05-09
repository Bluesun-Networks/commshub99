// SPDX-License-Identifier: AGPL-3.0-or-later
import { bootstrapAdmin, getAuthBootstrapState } from "@commshub99/auth";
import { NextResponse } from "next/server";
import { setSessionCookie } from "../_cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BootstrapPayload = {
  email?: string;
  name?: string;
  password?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as BootstrapPayload;

  try {
    const session = bootstrapAdmin({
      email: payload.email ?? "",
      password: payload.password ?? "",
      ...(payload.name ? { name: payload.name } : {}),
    });
    const response = NextResponse.json({ user: session.user });

    setSessionCookie(response, session.token);

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create admin" },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json(getAuthBootstrapState());
}
