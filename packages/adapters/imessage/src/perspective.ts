// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SelfPerspective } from "@commshub99/core";
import type { Database as SqliteDatabase } from "better-sqlite3";

export type ImessagePerspective = {
  self?: SelfPerspective;
  selfIdentifiers?: string[];
  selfNames?: string[];
};

export function normalizePerspectiveValue(value: string) {
  return value.trim().toLowerCase();
}

export function normalizedPerspectiveValues(values: Array<string | undefined> | undefined) {
  return [
    ...new Set(
      (values ?? []).filter((value): value is string => !!value).map(normalizePerspectiveValue),
    ),
  ];
}

export function selfIdentifiersForPerspective(options: ImessagePerspective) {
  return normalizedPerspectiveValues([
    ...(options.self?.identifiers ?? []),
    options.self?.userId,
    ...(options.selfIdentifiers ?? []),
  ]);
}

export function selfNamesForPerspective(options: ImessagePerspective) {
  return normalizedPerspectiveValues([
    options.self?.displayName,
    ...(options.self?.names ?? []),
    ...(options.selfNames ?? []),
  ]);
}

export function inferredSelfContactIds(sqlite: SqliteDatabase) {
  const total = sqlite
    .prepare(
      `SELECT count(DISTINCT chat_id) AS count
      FROM chat_contact_matches
      WHERE status = 'matched'
        AND contact_id IS NOT NULL`,
    )
    .get() as { count?: number } | undefined;

  if (!total?.count || total.count < 2) {
    return [];
  }

  const rows = sqlite
    .prepare(
      `SELECT contact_id, count(DISTINCT chat_id) AS count
      FROM chat_contact_matches
      WHERE status = 'matched'
        AND contact_id IS NOT NULL
      GROUP BY contact_id
      HAVING count(DISTINCT chat_id) = ?`,
    )
    .all(total.count) as Array<{ contact_id?: string }>;

  return normalizedPerspectiveValues(rows.map((row) => row.contact_id));
}
