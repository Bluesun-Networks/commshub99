// SPDX-License-Identifier: AGPL-3.0-or-later
import { destroySession, SESSION_COOKIE_NAME } from "@commshub99/auth";
import { NextResponse } from "next/server";
import { clearSessionCookie } from "../_cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  destroySession(token ? decodeURIComponent(token) : null);

  const response = NextResponse.json({ ok: true });

  clearSessionCookie(response);

  return response;
}
