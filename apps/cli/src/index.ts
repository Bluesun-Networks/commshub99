// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  clearLocalAdminUserSessions,
  createLocalAdminUser,
  listLocalAdminUsers,
  resetLocalAdminPassword,
  setLocalAdminUserDisabled,
  setLocalAdminUserRole,
} from "@commshub99/auth";
import { resolveDatabasePath } from "@commshub99/db";
import Database from "better-sqlite3";

type Role = "admin" | "readonly";

function usage() {
  console.log(`commshub99 local admin

Anyone with shell access to the host can manage local app users.

Usage:
  bun run --filter @commshub99/cli admin status
  bun run --filter @commshub99/cli admin users:list
  bun run --filter @commshub99/cli admin users:create --email EMAIL [--name NAME] [--role admin|readonly] [--password PASSWORD]
  bun run --filter @commshub99/cli admin users:reset-password --email EMAIL [--password PASSWORD]
  bun run --filter @commshub99/cli admin users:set-role --email EMAIL --role admin|readonly
  bun run --filter @commshub99/cli admin users:disable --email EMAIL
  bun run --filter @commshub99/cli admin users:enable --email EMAIL
  bun run --filter @commshub99/cli admin users:clear-sessions --email EMAIL

Database:
  ${resolveDatabasePath()}
`);
}

function resolveImsgDataDir() {
  return process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
}

function statusIcon(ok: boolean) {
  return ok ? "ok" : "fail";
}

function warningIcon(ok: boolean) {
  return ok ? "ok" : "warn";
}

function canRead(path: string) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function countFiles(directory: string) {
  if (!existsSync(directory)) {
    return 0;
  }

  return readdirSync(directory, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && !entry.name.startsWith("."),
  ).length;
}

function countDraftFiles(directory: string): number {
  if (!existsSync(directory)) {
    return 0;
  }

  let count = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      count += countDraftFiles(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md") && entryPath.includes("/drafts/")) {
      count += 1;
    }
  }

  return count;
}

function latestFile(directory: string) {
  if (!existsSync(directory)) {
    return null;
  }

  return (
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => {
        const path = join(directory, entry.name);

        return {
          mtimeMs: statSync(path).mtimeMs,
          name: entry.name,
          path,
        };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0] ?? null
  );
}

function frontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const values = new Map<string, string>();

  if (!match?.[1]) {
    return values;
  }

  let lastKey = "";

  for (const rawLine of match[1].split(/\r?\n/)) {
    if (/^\s+/.test(rawLine) && lastKey) {
      values.set(lastKey, `${values.get(lastKey) ?? ""} ${rawLine.trim()}`.trim());
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    lastKey = rawLine.slice(0, separatorIndex).trim();
    values.set(
      lastKey,
      rawLine
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, ""),
    );
  }

  return values;
}

async function httpStatus(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    return response.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}

function listeningOnUrl(url: string) {
  try {
    const parsed = new URL(url);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output.includes(`:${port} `) || output.includes(`:${port} (LISTEN)`);
  } catch {
    return false;
  }
}

function launchdStatus(label: string) {
  const uid = process.getuid?.();

  if (uid === undefined) {
    return { detail: "not macOS launchd", ok: false };
  }

  try {
    const output = execFileSync("launchctl", ["print", `gui/${uid}/${label}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const running = /state = running/.test(output);

    return {
      detail: running ? "running" : "loaded, not running",
      ok: running,
    };
  } catch {
    return {
      detail: "not loaded",
      ok: false,
    };
  }
}

function archiveCounts(databasePath: string) {
  if (!existsSync(databasePath)) {
    return null;
  }

  const sqlite = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const chats = sqlite.prepare("SELECT count(*) AS count FROM chats").get() as { count: number };
    const messages = sqlite.prepare("SELECT count(*) AS count FROM messages").get() as {
      count: number;
    };

    return {
      chats: chats.count,
      messages: messages.count,
    };
  } finally {
    sqlite.close();
  }
}

function printCheck(label: string, ok: boolean, detail: string) {
  console.log(`${statusIcon(ok)}  ${label}: ${detail}`);
}

function printWarn(label: string, ok: boolean, detail: string) {
  console.log(`${warningIcon(ok)}  ${label}: ${detail}`);
}

async function printStatus() {
  const dataDir = resolveImsgDataDir();
  const hubDbPath = resolveDatabasePath();
  const imessageDbPath = join(dataDir, "imessage.sqlite");
  const webUrl = process.env.COMMSHUB99_WEB_URL ?? "http://localhost:3000";
  const webStatus = await httpStatus(webUrl);
  const webListening = webStatus === 0 && listeningOnUrl(webUrl);
  const users = listLocalAdminUsers();
  const archive = archiveCounts(imessageDbPath);
  const monitor = launchdStatus("com.imsg-agent.archive-monitor");
  const worker = launchdStatus("com.imsg-agent.worker");
  const latestError = latestFile(join(dataDir, "errors"));

  console.log("commshub99 status\n");
  printCheck(
    "web",
    (webStatus > 0 && webStatus < 500) || webListening,
    `${webUrl} -> ${webStatus || (webListening ? "listening" : "unreachable")}`,
  );
  printCheck("hub db", canRead(hubDbPath), hubDbPath);
  printCheck("auth users", users.length > 0, `${users.length} local user(s)`);
  printCheck("iMessage data", canRead(dataDir), dataDir);
  printCheck(
    "iMessage archive",
    !!archive,
    archive ? `${archive.chats} chats, ${archive.messages} messages` : `${imessageDbPath} missing`,
  );
  printWarn("archive monitor", monitor.ok, monitor.detail);
  printWarn("agent worker", worker.ok, worker.detail);

  const drafts = countDraftFiles(join(dataDir, "chats"));
  const outbox = countFiles(join(dataDir, "outbox"));
  const sent = countFiles(join(dataDir, "sent"));
  const errors = countFiles(join(dataDir, "errors"));

  console.log("\nqueues");
  console.log(`drafts: ${drafts}`);
  console.log(`outbox: ${outbox}`);
  console.log(`sent: ${sent}`);
  console.log(`errors: ${errors}`);

  if (latestError) {
    const meta = frontmatter(readFileSync(latestError.path, "utf8"));

    console.log("\nlatest error");
    console.log(`file: ${latestError.name}`);
    console.log(`failed_at: ${meta.get("failed_at") || "unknown"}`);
    console.log(`chat_id: ${meta.get("chat_id") || "unknown"}`);
    console.log(`source_rowid: ${meta.get("source_rowid") || "unknown"}`);
    console.log(`error: ${meta.get("error") || "unknown"}`);
  }
}

function option(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
}

function requireOption(name: string) {
  const value = option(name).trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function roleOption(defaultRole?: Role): Role {
  const role = (option("--role").trim() || defaultRole) as Role | undefined;

  if (role !== "admin" && role !== "readonly") {
    throw new Error("--role must be admin or readonly");
  }

  return role;
}

function generatedPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

function displayDate(date: Date | null) {
  return date ? date.toISOString() : "";
}

function printUsers() {
  const users = listLocalAdminUsers();

  if (users.length === 0) {
    console.log("No local users exist yet.");
    return;
  }

  console.table(
    users.map((user) => ({
      createdAt: displayDate(user.createdAt),
      disabled: user.disabled ? "yes" : "no",
      email: user.email,
      lastLoginAt: displayDate(user.lastLoginAt),
      name: user.name,
      role: user.role,
    })),
  );
}

function printPassword(password: string) {
  console.log("Temporary password:");
  console.log(password);
  console.log("Store it now; commshub99 will not be able to show it again.");
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      usage();
      return;

    case "status":
      await printStatus();
      return;

    case "users:list":
      printUsers();
      return;

    case "users:create": {
      const password = option("--password").trim() || generatedPassword();
      const user = createLocalAdminUser({
        email: requireOption("--email"),
        name: option("--name"),
        password,
        role: roleOption("readonly"),
      });

      console.log(`Created ${user.role} user ${user.email}.`);

      if (!option("--password").trim()) {
        printPassword(password);
      }
      return;
    }

    case "users:reset-password": {
      const password = option("--password").trim() || generatedPassword();
      const user = resetLocalAdminPassword({
        email: requireOption("--email"),
        password,
      });

      console.log(`Reset password and cleared sessions for ${user.email}.`);

      if (!option("--password").trim()) {
        printPassword(password);
      }
      return;
    }

    case "users:set-role": {
      const user = setLocalAdminUserRole(requireOption("--email"), roleOption());
      console.log(`Set ${user.email} to ${user.role}.`);
      return;
    }

    case "users:disable": {
      const user = setLocalAdminUserDisabled(requireOption("--email"), true);
      console.log(`Disabled ${user.email} and cleared active sessions.`);
      return;
    }

    case "users:enable": {
      const user = setLocalAdminUserDisabled(requireOption("--email"), false);
      console.log(`Enabled ${user.email}.`);
      return;
    }

    case "users:clear-sessions": {
      const user = clearLocalAdminUserSessions(requireOption("--email"));
      console.log(`Cleared active sessions for ${user.email}.`);
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 1;
});
