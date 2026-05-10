// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PublicUser } from "./index.js";
import { can, type Permission } from "./permissions.js";

export const PERMISSION_DENIED_CODE = "permission_denied";

export interface PermissionCheckResult {
  code: typeof PERMISSION_DENIED_CODE;
  message: string;
  ok: false;
  permission: Permission;
}

export function requirePermission(
  user: PublicUser | null | undefined,
  permission: Permission,
): PermissionCheckResult | null {
  if (can(user, permission)) {
    return null;
  }

  return {
    code: PERMISSION_DENIED_CODE,
    message: "You do not have permission to perform this action.",
    ok: false,
    permission,
  };
}
