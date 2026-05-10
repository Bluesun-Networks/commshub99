// SPDX-License-Identifier: AGPL-3.0-or-later
import type { User } from "@commshub99/db";

export const permissions = [
  "conversations:read",
  "messages:read",
  "drafts:read",
  "contacts:read",
  "contacts:write",
  "drafts:edit",
  "drafts:approve",
  "drafts:reject",
  "drafts:schedule",
  "schedules:manage",
  "users:manage",
  "settings:manage",
  "audit:read",
] as const;

export type Permission = (typeof permissions)[number];
export type Role = User["role"];
export type PermissionUser = Pick<User, "role"> | null | undefined;

const readonlyPermissions = new Set<Permission>([
  "conversations:read",
  "messages:read",
  "drafts:read",
  "contacts:read",
]);

export function can(user: PermissionUser, permission: Permission) {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  if (user.role === "readonly") {
    return readonlyPermissions.has(permission);
  }

  return false;
}
