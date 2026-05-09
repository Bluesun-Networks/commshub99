// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRow = {
  chat_id: number;
  contact_id: string | null;
  contact_name: string | null;
  handle: string;
  is_group: number;
  last_message: string | null;
  last_message_at: string;
  matched_count: number;
  message_count: number;
  name: string;
  service: string;
};

type MessageRow = {
  body: string;
  direction: "inbound" | "outbound";
  rowid: number;
  sent_at: string;
};

function resolveImessageDatabasePath() {
  const dataDir = process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
  return join(dataDir, "imessage.sqlite");
}

function displayDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayName(row: ConversationRow) {
  if (row.name) {
    return row.name;
  }

  if (row.contact_name) {
    return row.contact_name;
  }

  if (row.is_group) {
    return "Group conversation";
  }

  return row.handle || "Unknown sender";
}

function normalizeMessageText(value: string | null) {
  if (!value) {
    return "";
  }

  return value
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  const databasePath = resolveImessageDatabasePath();

  if (!existsSync(databasePath)) {
    return NextResponse.json(
      {
        conversations: [],
        error: `No iMessage database found at ${databasePath}`,
      },
      { status: 404 },
    );
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const conversationRows = sqlite
      .prepare(`
        WITH ranked_matches AS (
          SELECT
            ccm.chat_id,
            ccm.contact_id,
            ccm.status,
            ccm.confidence,
            contacts.full_name AS contact_name,
            row_number() OVER (
              PARTITION BY ccm.chat_id
              ORDER BY
                CASE WHEN ccm.status = 'matched' AND ccm.contact_id IS NOT NULL THEN 0 ELSE 1 END,
                ccm.confidence DESC,
                contacts.full_name
            ) AS rank
          FROM chat_contact_matches ccm
          LEFT JOIN contacts ON contacts.contact_id = ccm.contact_id
        ),
        contact_rollup AS (
          SELECT
            chat_id,
            sum(CASE WHEN status = 'matched' AND contact_id IS NOT NULL THEN 1 ELSE 0 END) AS matched_count
          FROM ranked_matches
          GROUP BY chat_id
        )
        SELECT
          chats.id AS chat_id,
          chats.name,
          chats.identifier AS handle,
          chats.service,
          chats.last_message_at,
          chats.is_group,
          ranked_matches.contact_id,
          ranked_matches.contact_name,
          coalesce(contact_rollup.matched_count, 0) AS matched_count,
          (
            SELECT messages.text
            FROM messages
            WHERE messages.chat_id = chats.id
              AND messages.is_reaction = 0
              AND messages.text != ''
            ORDER BY messages.date DESC
            LIMIT 1
          ) AS last_message,
          (
            SELECT count(*)
            FROM messages
            WHERE messages.chat_id = chats.id
          ) AS message_count
        FROM chats
        LEFT JOIN contact_rollup ON contact_rollup.chat_id = chats.id
        LEFT JOIN ranked_matches ON ranked_matches.chat_id = chats.id AND ranked_matches.rank = 1
        ORDER BY chats.last_message_at DESC
        LIMIT 80
      `)
      .all() as ConversationRow[];

    const messageStatement = sqlite.prepare(`
      SELECT
        rowid,
        text AS body,
        CASE WHEN is_from_me = 1 THEN 'outbound' ELSE 'inbound' END AS direction,
        date AS sent_at
      FROM (
        SELECT rowid, text, is_from_me, date
        FROM messages
        WHERE chat_id = ?
          AND is_reaction = 0
          AND (text != '' OR has_attachments = 1)
        ORDER BY date DESC
        LIMIT 35
      )
      ORDER BY sent_at ASC
    `);

    const conversations = conversationRows.map((row) => {
      const messages = messageStatement.all(row.chat_id) as MessageRow[];
      const lastMessage = normalizeMessageText(row.last_message);
      const fallbackMessage = lastMessage || `${row.message_count} archived messages`;

      return {
        channel: row.service || "iMessage",
        contact: displayName(row),
        handle: row.is_group ? `${row.message_count} messages` : row.handle,
        id: `imessage:chat:${row.chat_id}`,
        lastMessage: fallbackMessage,
        lastMessageAt: displayDate(row.last_message_at),
        messageCount: row.message_count,
        messages: messages.map((message) => ({
          body: normalizeMessageText(message.body) || "Attachment",
          direction: message.direction,
          id: `imessage:message:${message.rowid}`,
          sentAt: displayDate(message.sent_at),
        })),
        status: row.matched_count > 0 ? "matched" : "unmatched",
        linkedContact:
          row.matched_count > 0 && row.contact_id
            ? {
                id: row.contact_id,
                name: row.contact_name || displayName(row),
              }
            : null,
        unreadCount: 0,
      };
    });

    return NextResponse.json({
      conversations,
      databasePath,
    });
  } finally {
    sqlite.close();
  }
}
