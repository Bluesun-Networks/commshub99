// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  getSessionByToken,
  type Permission,
  requirePermission,
  SESSION_COOKIE_NAME,
} from "@commshub99/auth";
import { NextResponse } from "next/server";

function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(/;\s*/);
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export function requireAuthenticatedRequest(request: Request) {
  const session = getSessionByToken(cookieValue(request, SESSION_COOKIE_NAME));

  if (!session) {
    return {
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      session: null,
    };
  }

  return {
    response: null,
    session,
  };
}

export function requirePermissionRequest(request: Request, permission: Permission) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth;
  }

  const denied = requirePermission(auth.session.user, permission);

  if (denied) {
    return {
      response: NextResponse.json(
        {
          code: denied.code,
          error: denied.message,
          permission: denied.permission,
        },
        { status: 403 },
      ),
      session: auth.session,
    };
  }

  return auth;
}
