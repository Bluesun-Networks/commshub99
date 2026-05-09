// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type ContactsMcpContact, listContactsFromContactsMcp } from "@commshub99/mcp-client";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContactRow = {
  contact_id: string;
  conversation_count: number;
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

function displayPhoto(value: string | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith("http") || value.startsWith("data:")) {
    return value;
  }

  return `data:image/jpeg;base64,${value}`;
}

function contactDisplayName(contact: ContactsMcpContact) {
  return (
    contact.fullName ||
    [contact.name.givenName, contact.name.familyName].filter(Boolean).join(" ") ||
    contact.organization?.name ||
    "Unnamed contact"
  );
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
        contacts: [],
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
      .all() as ContactRow[];
    const conversationCounts = new Map(
      rows.map((row) => [row.contact_id, row.conversation_count] as const),
    );
    const contactsMcpContacts = await listContactsFromContactsMcp();

    const contacts = contactsMcpContacts.map((contact) => ({
      birthday: contact.birthday ?? "",
      categories: contact.categories,
      conversationCount: conversationCounts.get(contact.id) ?? 0,
      displayName: contactDisplayName(contact),
      emailPoints: contact.emails.map((email) => ({
        kind: "email",
        label: email.type ?? "other",
        value: email.value,
      })),
      familyName: contact.name.familyName ?? "",
      givenName: contact.name.givenName ?? "",
      id: contact.id,
      notes: contact.notes ?? "",
      organizationName: contact.organization?.name ?? "",
      organizationTitle: contact.organization?.title ?? "",
      phonePoints: contact.phones.map((phone) => ({
        kind: "phone",
        label: phone.type ?? "other",
        value: phone.value,
      })),
      photoUrl: displayPhoto(contact.photo),
      updatedAt: contact.metadata?.modified ? displayDate(contact.metadata.modified) : "Unknown",
    }));

    return NextResponse.json({
      contacts,
      databasePath,
    });
  } finally {
    sqlite.close();
  }
}
