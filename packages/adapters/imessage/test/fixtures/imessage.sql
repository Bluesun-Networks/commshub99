-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE TABLE chats (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL,
  service TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  is_group INTEGER NOT NULL
);

CREATE TABLE contacts (
  contact_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL
);

CREATE TABLE chat_contact_matches (
  chat_id INTEGER NOT NULL,
  contact_id TEXT,
  status TEXT NOT NULL,
  confidence REAL NOT NULL
);

CREATE TABLE messages (
  rowid INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  is_from_me INTEGER NOT NULL,
  date TEXT NOT NULL,
  is_reaction INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0
);

INSERT INTO chats (id, name, identifier, service, last_message_at, is_group)
VALUES
  (7, '', '+15551234567', 'iMessage', '2026-05-10T21:00:00Z', 0),
  (8, 'Family', 'chat-family', 'iMessage', '2026-05-10T20:00:00Z', 1);

INSERT INTO contacts (contact_id, full_name)
VALUES
  ('contact-1', 'Ada Lovelace'),
  ('self-contact', 'Jon Zobrist');

INSERT INTO chat_contact_matches (chat_id, contact_id, status, confidence)
VALUES
  (7, 'contact-1', 'matched', 0.98),
  (7, 'self-contact', 'matched', 0.99),
  (8, 'self-contact', 'matched', 0.99),
  (8, NULL, 'unmatched', 0);

INSERT INTO messages (rowid, chat_id, text, is_from_me, date, is_reaction, has_attachments)
VALUES
  (100, 7, 'Older inbound', 0, '2026-05-10T20:55:00Z', 0, 0),
  (101, 7, 'Latest outbound', 1, '2026-05-10T21:00:00Z', 0, 0),
  (102, 8, 'Group hello', 0, '2026-05-10T20:00:00Z', 0, 0);
