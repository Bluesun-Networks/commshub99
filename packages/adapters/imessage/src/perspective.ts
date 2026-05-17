// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SelfPerspective } from "@commshub99/core";

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
