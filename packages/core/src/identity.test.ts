// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { selfPerspectiveFromUser } from "./identity.js";

describe("self perspective", () => {
  it("builds a stable self identity from the authenticated user", () => {
    expect(
      selfPerspectiveFromUser({
        email: "jon@example.com",
        id: "user-1",
        name: "Jon Zobrist",
      }),
    ).toEqual({
      displayName: "Jon Zobrist",
      identifiers: ["user-1", "jon@example.com"],
      names: ["Jon Zobrist"],
      userId: "user-1",
    });
  });
});
