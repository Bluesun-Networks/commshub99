// SPDX-License-Identifier: AGPL-3.0-or-later
import { signIn } from "@commshub99/auth";
import { NextResponse } from "next/server";
import { setSessionCookie } from "../_cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LoginPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as LoginPayload;

  try {
    const session = signIn({
      email: payload.email ?? "",
      ipAddress: request.headers.get("x-forwarded-for"),
      password: payload.password ?? "",
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json({ user: session.user });

    setSessionCookie(response, session.token);

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sign in" },
      { status: 401 },
    );
  }
}
