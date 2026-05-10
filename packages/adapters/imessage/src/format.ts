// SPDX-License-Identifier: AGPL-3.0-or-later
export function displayDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function normalizeMessageText(value: string | null) {
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
