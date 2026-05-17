// SPDX-License-Identifier: AGPL-3.0-or-later
import { listImessageContactConversationCounts } from "@commshub99/adapter-imessage";
import {
  ContactsMcpClientError,
  type ContactsMcpContact,
  listContactsFromContactsMcp,
} from "@commshub99/mcp-client";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { conversationCounts, databasePath, error } = listImessageContactConversationCounts({
    selfIdentifiers: [auth.session.user.email, auth.session.user.id],
    selfNames: [auth.session.user.name],
  });

  if (error) {
    return NextResponse.json(
      {
        contacts: [],
        error,
      },
      { status: 404 },
    );
  }

  let contactsMcpContacts: ContactsMcpContact[];
  let contactsError: { code: string; message: string } | null = null;

  try {
    contactsMcpContacts = await listContactsFromContactsMcp();
  } catch (error) {
    contactsMcpContacts = [];
    contactsError =
      error instanceof ContactsMcpClientError
        ? { code: error.code, message: error.message }
        : { code: "contacts_unavailable", message: "Contacts are unavailable" };
  }

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
    contactsError,
    databasePath,
  });
}
