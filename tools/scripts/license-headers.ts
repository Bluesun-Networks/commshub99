// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Checks or adds SPDX license headers to TypeScript source files.
 *
 * Usage:
 *   node --import tsx tools/scripts/license-headers.ts          # check (exits 1 if any missing)
 *   node --import tsx tools/scripts/license-headers.ts --fix    # add missing headers
 *
 * CI runs in check mode. Contributors run --fix locally.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HEADER = "// SPDX-License-Identifier: AGPL-3.0-or-later";

const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "playwright-report",
  ".git",
  ".claude",
]);

const IGNORE_FILES = new Set(["vite.config.ts", "vite.config.mts"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (stat.isFile()) {
      const ext = entry.slice(entry.lastIndexOf("."));
      if (EXTENSIONS.has(ext) && !IGNORE_FILES.has(entry)) {
        yield full;
      }
    }
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fix = process.argv.includes("--fix");

const missing: string[] = [];

for (const file of walk(root)) {
  const content = readFileSync(file, "utf8");
  if (!content.startsWith(HEADER)) {
    if (fix) {
      const separator = content.startsWith("#!") ? "\n" : "";
      const [shebang, rest] = content.startsWith("#!")
        ? [content.split("\n")[0], content.slice(content.indexOf("\n") + 1)]
        : ["", content];
      writeFileSync(
        file,
        shebang ? `${shebang}\n${HEADER}\n${rest}` : `${HEADER}\n${separator}${rest}`,
      );
      console.log(`Fixed: ${relative(root, file)}`);
    } else {
      missing.push(relative(root, file));
    }
  }
}

if (!fix && missing.length > 0) {
  console.error("Missing SPDX header in:");
  for (const f of missing) console.error(`  ${f}`);
  console.error(`\nRun: node --import tsx tools/scripts/license-headers.ts --fix`);
  process.exit(1);
}

if (fix) {
  console.log(`Done. Fixed ${missing.length === 0 ? 0 : "some"} files.`);
} else {
  console.log("All source files have SPDX headers.");
}
