// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { resolveImessageDatabasePath } from "./paths.js";

type ContactConversationCountRow = {
  contact_id: string;
  conversation_count: number;
};

export function listImessageContactConversationCounts() {
  const databasePath = resolveImessageDatabasePath();

  if (!existsSync(databasePath)) {
    return {
      conversationCounts: new Map<string, number>(),
      databasePath,
      error: `No iMessage database found at ${databasePath}`,
    };
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const rows = sqlite
      .prepare(`
        SELECT
          contact_id,
          count(DISTINCT chat_id) AS conversation_count
        FROM chat_contact_matches
        WHERE status = 'matched'
          AND contact_id IS NOT NULL
        GROUP BY contact_id
      `)
      .all() as ContactConversationCountRow[];

    return {
      conversationCounts: new Map(
        rows.map((row) => [row.contact_id, row.conversation_count] as const),
      ),
      databasePath,
      error: null,
    };
  } finally {
    sqlite.close();
  }
}
