// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ContactsMcpClientError,
  clearContactsMcpCacheForTest,
  listContactsFromContactsMcp,
} from "./index.js";

const originalBin = process.env.CONTACTS_MCP_BIN;
const originalArgs = process.env.CONTACTS_MCP_ARGS;
const originalMode = process.env.CONTACTS_MCP_MODE;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "commshub99-contacts-mcp-"));
  process.env.CONTACTS_MCP_BIN = process.execPath;
  process.env.CONTACTS_MCP_ARGS = mockServerPath();
  delete process.env.CONTACTS_MCP_MODE;
  clearContactsMcpCacheForTest();
});

afterEach(() => {
  restoreEnv("CONTACTS_MCP_BIN", originalBin);
  restoreEnv("CONTACTS_MCP_ARGS", originalArgs);
  restoreEnv("CONTACTS_MCP_MODE", originalMode);
  clearContactsMcpCacheForTest();

  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function mockServerPath() {
  const scriptPath = join(tempDir, "contacts-mcp-mock.cjs");

  writeFileSync(
    scriptPath,
    `
const fs = require("node:fs");
let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);

    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {} }) + "\\n");
      continue;
    }

    if (process.env.CONTACTS_MCP_MODE === "fail") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: "mock contacts failure" }
      }) + "\\n");
      continue;
    }

    fs.writeFileSync(message.params.arguments.outputPath, JSON.stringify([
      {
        birthday: "",
        categories: ["family"],
        emails: [],
        fullName: "Ada Lovelace",
        id: "contact-1",
        name: { givenName: "Ada", familyName: "Lovelace" },
        phones: [],
      }
    ]));
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      result: { content: [{ type: "text", text: JSON.stringify({ exported: 1 }) }] }
    }) + "\\n");
  }
});
`,
    "utf8",
  );

  return scriptPath;
}

describe("contacts-mcp client", () => {
  it("exports contacts and serves subsequent reads from the cache", async () => {
    const contacts = await listContactsFromContactsMcp();

    process.env.CONTACTS_MCP_MODE = "fail";
    const cachedContacts = await listContactsFromContactsMcp();

    expect(contacts).toHaveLength(1);
    expect(cachedContacts).toEqual(contacts);
  });

  it("raises a structured error when contacts export fails without cache", async () => {
    process.env.CONTACTS_MCP_MODE = "fail";

    await expect(listContactsFromContactsMcp()).rejects.toMatchObject({
      code: "tool_failed",
      name: "ContactsMcpClientError",
    } satisfies Partial<ContactsMcpClientError>);
  });
});
