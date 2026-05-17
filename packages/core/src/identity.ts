// SPDX-License-Identifier: AGPL-3.0-or-later

export type SelfPerspective = {
  displayName: string;
  identifiers: string[];
  names: string[];
  userId: string;
};

export type SelfPerspectiveUser = {
  email?: string;
  id: string;
  name?: string;
};

function unique(values: Array<string | undefined>) {
  return [
    ...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  ];
}

export function selfPerspectiveFromUser(user: SelfPerspectiveUser): SelfPerspective {
  const displayName = user.name?.trim() || user.email?.trim() || user.id;

  return {
    displayName,
    identifiers: unique([user.id, user.email]),
    names: unique([displayName, user.name]),
    userId: user.id,
  };
}
