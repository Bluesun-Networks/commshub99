// SPDX-License-Identifier: AGPL-3.0-or-later
export function frontmatterValue(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta = new Map<string, string>();

  if (match?.[1]) {
    let lastKey: string | null = null;

    for (const rawLine of match[1].split(/\r?\n/)) {
      if (/^\s+/.test(rawLine) && lastKey) {
        const previous = meta.get(lastKey) ?? "";
        meta.set(lastKey, `${previous} ${rawLine.trim()}`.trim());
        continue;
      }

      const separatorIndex = rawLine.indexOf(":");

      if (separatorIndex === -1) {
        continue;
      }

      lastKey = rawLine.slice(0, separatorIndex).trim();
      meta.set(lastKey, frontmatterValue(rawLine.slice(separatorIndex + 1)));
    }
  }

  return {
    body: (match?.[2] ?? content).trim(),
    meta,
  };
}
