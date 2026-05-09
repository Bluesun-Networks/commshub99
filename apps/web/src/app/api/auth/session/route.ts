// SPDX-License-Identifier: AGPL-3.0-or-later
import { getAuthBootstrapState, getSessionByToken, SESSION_COOKIE_NAME } from "@commshub99/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
}

export async function GET(request: Request) {
  const session = getSessionByToken(sessionToken(request));
  const bootstrap = getAuthBootstrapState();

  return NextResponse.json({
    needsBootstrap: bootstrap.needsBootstrap,
    user: session?.user ?? null,
  });
}
