// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";
import type { ContextHarvestSuggestion, PersonalDetailBoundary } from "@commshub99/core";
import Database from "better-sqlite3";
import { resolveImessageDatabasePath } from "./paths.js";

type HarvestChatRow = {
  contact_id: string | null;
  contact_name: string | null;
  handle: string;
  id: number;
  is_group: number;
  name: string;
};

type HarvestMessageRow = {
  direction: "inbound" | "outbound";
  rowid: number;
  sent_at: string;
  text: string;
};

function snippet(text: string) {
  return text.trim().replace(/\s+/g, " ").slice(0, 140);
}

function suggestForChat(chat: HarvestChatRow, messages: HarvestMessageRow[]) {
  const text = messages.map((message) => message.text.toLowerCase()).join(" ");
  const isGroup = chat.is_group === 1;
  const displayName =
    chat.name || chat.contact_name || (isGroup ? "Group conversation" : chat.handle);
  const relationship = text.includes("family") ? "family" : isGroup ? "friend" : "unknown";
  const tone = text.includes("thanks") || text.includes("please") ? "polite" : "direct";
  const allowedPersonalDetails: PersonalDetailBoundary[] = [];

  if (text.includes("on my way") || text.includes("where are you")) {
    allowedPersonalDetails.push("location");
  }

  if (text.includes("family")) {
    allowedPersonalDetails.push("family_updates");
  }
  const evidence = messages
    .filter((message) => message.text.trim())
    .slice(-3)
    .map((message) => ({
      rowid: message.rowid,
      snippet: snippet(message.text),
    }));
  const base = {
    confidence: Math.min(0.9, 0.35 + messages.length * 0.04),
    evidence,
    payload: {
      allowedPersonalDetails,
      customPrompt: "",
      displayName,
      relationship,
      replyPosture: "reply_if_needed",
      tone,
    },
    source: "harvest",
  } satisfies Omit<ContextHarvestSuggestion, "contextType" | "targetKey">;
  const suggestions: ContextHarvestSuggestion[] = [
    {
      ...base,
      contextType: "conversation",
      targetKey: `imessage:${chat.id}`,
    },
  ];

  if (!isGroup) {
    suggestions.unshift({
      ...base,
      contextType: "contact",
      targetKey: chat.contact_id ?? chat.handle,
    });
  }

  return suggestions;
}

export function harvestImessageContextSuggestions(limit = 25) {
  const databasePath = resolveImessageDatabasePath();

  if (!existsSync(databasePath)) {
    return {
      databasePath,
      error: `No iMessage database found at ${databasePath}`,
      suggestions: [],
    };
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const chats = sqlite
      .prepare(
        `SELECT
          chats.id,
          chats.name,
          chats.identifier AS handle,
          chats.is_group,
          contacts.contact_id,
          contacts.full_name AS contact_name
        FROM chats
        LEFT JOIN chat_contact_matches ON chat_contact_matches.chat_id = chats.id
          AND chat_contact_matches.status = 'matched'
        LEFT JOIN contacts ON contacts.contact_id = chat_contact_matches.contact_id
        ORDER BY chats.last_message_at DESC
        LIMIT ?`,
      )
      .all(limit) as HarvestChatRow[];
    const messages = sqlite.prepare(
      `SELECT
        rowid,
        text,
        CASE WHEN is_from_me = 1 THEN 'outbound' ELSE 'inbound' END AS direction,
        date AS sent_at
      FROM messages
      WHERE chat_id = ?
        AND is_reaction = 0
        AND text != ''
      ORDER BY date ASC
      LIMIT 120`,
    );
    const suggestions = chats.flatMap((chat) => {
      const rows = messages.all(chat.id) as HarvestMessageRow[];

      return suggestForChat(chat, rows);
    });

    return {
      databasePath,
      error: null,
      suggestions,
    };
  } finally {
    sqlite.close();
  }
}
