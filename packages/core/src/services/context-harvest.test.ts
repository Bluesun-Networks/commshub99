// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { harvestContextSuggestions } from "./context-harvest.js";

describe("harvestContextSuggestions", () => {
  it("produces reviewable contact and conversation suggestions with evidence", () => {
    const suggestions = harvestContextSuggestions([
      {
        channelId: "imessage",
        contactKey: "phone:+15551234567",
        displayName: "Levi",
        isGroup: false,
        messages: [
          {
            direction: "inbound",
            rowid: 100,
            sentAt: "2026-05-10T20:00:00Z",
            text: "Are you on your way to family dinner?",
          },
          {
            direction: "outbound",
            rowid: 101,
            sentAt: "2026-05-10T20:01:00Z",
            text: "Yep, on my way now. Thanks.",
          },
        ],
        roomKey: "7",
      },
    ]);

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      confidence: expect.any(Number),
      contextType: "contact",
      source: "harvest",
      targetKey: "phone:+15551234567",
    });
    expect(suggestions[0]?.payload).toMatchObject({
      allowedPersonalDetails: ["location", "family_updates"],
      relationship: "family",
      tone: "polite",
    });
    expect(suggestions[0]?.evidence).toEqual([
      { rowid: 100, snippet: "Are you on your way to family dinner?" },
      { rowid: 101, snippet: "Yep, on my way now. Thanks." },
    ]);
  });
});
