// SPDX-License-Identifier: AGPL-3.0-or-later

export type ImessagePerspective = {
  selfIdentifiers?: string[];
  selfNames?: string[];
};

export function normalizePerspectiveValue(value: string) {
  return value.trim().toLowerCase();
}

export function normalizedPerspectiveValues(values: string[] | undefined) {
  return [...new Set((values ?? []).map(normalizePerspectiveValue).filter(Boolean))];
}
