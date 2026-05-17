// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { resolveImessageDatabasePath } from "./paths.js";
import {
  type ImessagePerspective,
  selfIdentifiersForPerspective,
  selfNamesForPerspective,
} from "./perspective.js";

type ContactConversationCountRow = {
  contact_id: string;
  conversation_count: number;
};

function placeholderList(values: string[]) {
  return values.length > 0 ? values.map(() => "?").join(", ") : "''";
}

export function listImessageContactConversationCounts(options: ImessagePerspective = {}) {
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
    const selfIdentifiers = selfIdentifiersForPerspective(options);
    const selfNames = selfNamesForPerspective(options);
    const rows = sqlite
      .prepare(`
        SELECT
          chat_contact_matches.contact_id,
          count(DISTINCT chat_id) AS conversation_count
        FROM chat_contact_matches
        LEFT JOIN contacts ON contacts.contact_id = chat_contact_matches.contact_id
        WHERE status = 'matched'
          AND chat_contact_matches.contact_id IS NOT NULL
          AND NOT (
            lower(coalesce(chat_contact_matches.contact_id, '')) IN (${placeholderList(selfIdentifiers)})
            OR lower(coalesce(contacts.full_name, '')) IN (${placeholderList(selfNames)})
          )
        GROUP BY chat_contact_matches.contact_id
      `)
      .all(...selfIdentifiers, ...selfNames) as ContactConversationCountRow[];

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
