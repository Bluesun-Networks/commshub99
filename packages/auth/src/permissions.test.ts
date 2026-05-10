// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { can, type Permission, permissions } from "./permissions.js";

const admin = { role: "admin" as const };
const readonly = { role: "readonly" as const };

describe("can", () => {
  it("allows admins to perform every known permission", () => {
    for (const permission of permissions) {
      expect(can(admin, permission)).toBe(true);
    }
  });

  it("allows readonly users to browse but not mutate", () => {
    const allowed: Permission[] = [
      "conversations:read",
      "messages:read",
      "drafts:read",
      "contacts:read",
    ];
    const denied = permissions.filter((permission) => !allowed.includes(permission));

    for (const permission of allowed) {
      expect(can(readonly, permission)).toBe(true);
    }

    for (const permission of denied) {
      expect(can(readonly, permission)).toBe(false);
    }
  });

  it("denies anonymous users", () => {
    for (const permission of permissions) {
      expect(can(null, permission)).toBe(false);
    }
  });
});
