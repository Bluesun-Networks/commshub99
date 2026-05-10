// SPDX-License-Identifier: AGPL-3.0-or-later

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

type JsonRpcResponse = {
  error?: {
    code: number;
    message: string;
  };
  id?: number;
  result?: unknown;
};

type ToolContent = {
  text?: string;
  type: string;
};

type ToolCallResult = {
  content?: ToolContent[];
  isError?: boolean;
};

const contactsCacheTtlMs = 10 * 60 * 1000;

let contactsCache:
  | {
      contacts: ContactsMcpContact[];
      fetchedAt: number;
    }
  | undefined;

export class ContactsMcpClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
    this.name = "ContactsMcpClientError";
  }
}

export type ContactsMcpContactPoint = {
  originalValue?: string;
  primary?: boolean;
  type?: string;
  value: string;
};

export type ContactsMcpContact = {
  birthday?: string;
  categories: string[];
  emails: ContactsMcpContactPoint[];
  fullName: string;
  id: string;
  metadata?: {
    modified?: string;
  };
  name: {
    familyName?: string;
    givenName?: string;
  };
  notes?: string;
  organization?: {
    name?: string;
    title?: string;
  };
  phones: ContactsMcpContactPoint[];
  photo?: string;
};

function contactsMcpCommand() {
  if (process.env.CONTACTS_MCP_BIN) {
    return {
      args: process.env.CONTACTS_MCP_ARGS?.split(" ").filter(Boolean) ?? [],
      command: process.env.CONTACTS_MCP_BIN,
    };
  }

  const entryCandidates = [
    process.env.CONTACTS_MCP_ENTRY,
    resolve(process.cwd(), "../contacts-mcp/dist/index.js"),
    resolve(process.cwd(), "../../contacts-mcp/dist/index.js"),
    join(homedir(), "src", "contacts-mcp", "dist", "index.js"),
  ].filter((candidate): candidate is string => !!candidate);
  const entry = entryCandidates.find((candidate) => existsSync(candidate));

  if (entry) {
    return {
      args: [entry],
      command: "bun",
    };
  }

  return {
    args: [],
    command: "contacts-mcp",
  };
}

function send(process: ChildProcessWithoutNullStreams, id: number, method: string, params = {}) {
  process.stdin.write(`${JSON.stringify({ id, jsonrpc: "2.0", method, params })}\n`);
}

function waitForResponse(responses: Map<number, JsonRpcResponse>, id: number, timeoutMs: number) {
  return new Promise<JsonRpcResponse>((resolveResponse, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const response = responses.get(id);

      if (response) {
        resolveResponse(response);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for contacts-mcp response ${id}`));
        return;
      }

      setTimeout(check, 25);
    };

    check();
  });
}

function contactsMcpTimeoutMs() {
  const configured = Number(process.env.CONTACTS_MCP_TIMEOUT_MS);

  return Number.isFinite(configured) && configured > 0 ? configured : 10_000;
}

function cachedContacts() {
  if (!contactsCache) {
    return null;
  }

  if (Date.now() - contactsCache.fetchedAt > contactsCacheTtlMs) {
    contactsCache = undefined;
    return null;
  }

  return contactsCache.contacts;
}

export async function callContactsMcpTool<T>(
  name: string,
  args: Record<string, unknown>,
  timeoutMs = contactsMcpTimeoutMs(),
) {
  const command = contactsMcpCommand();
  const child = spawn(command.command, command.args, {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = new Map<number, JsonRpcResponse>();
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (data: Buffer) => {
    stdout += data.toString();
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const message = JSON.parse(line) as JsonRpcResponse;

        if (typeof message.id === "number") {
          responses.set(message.id, message);
        }
      } catch {
        stderr += `\nUnparseable contacts-mcp stdout: ${line}`;
      }
    }
  });
  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  try {
    send(child, 1, "initialize", {
      capabilities: {},
      clientInfo: { name: "commshub99", version: "0.0.1" },
      protocolVersion: "2024-11-05",
    });
    const initResponse = await waitForResponse(responses, 1, timeoutMs);

    if (initResponse.error) {
      throw new ContactsMcpClientError("initialize_failed", initResponse.error.message);
    }

    send(child, 2, "tools/call", {
      arguments: args,
      name,
    });
    const toolResponse = await waitForResponse(responses, 2, timeoutMs);

    if (toolResponse.error) {
      throw new ContactsMcpClientError("tool_failed", toolResponse.error.message);
    }

    const result = toolResponse.result as ToolCallResult | undefined;

    if (result?.isError) {
      throw new ContactsMcpClientError(
        "tool_returned_error",
        result.content?.[0]?.text ?? `contacts-mcp tool ${name} failed`,
      );
    }

    const text = result?.content?.find((item) => item.type === "text")?.text;

    if (!text) {
      throw new ContactsMcpClientError(
        "missing_text_content",
        `contacts-mcp tool ${name} returned no text content`,
      );
    }

    return JSON.parse(text) as T;
  } catch (error) {
    const detail = stderr.trim();

    if (detail && error instanceof Error) {
      throw new ContactsMcpClientError(
        error instanceof ContactsMcpClientError ? error.code : "contacts_mcp_failed",
        `${error.message}: ${detail}`,
        error,
      );
    }

    throw error instanceof ContactsMcpClientError
      ? error
      : new ContactsMcpClientError(
          "contacts_mcp_failed",
          error instanceof Error ? error.message : "contacts-mcp failed",
          error,
        );
  } finally {
    child.kill();
  }
}

export async function listContactsFromContactsMcp() {
  const cached = cachedContacts();

  if (cached) {
    return cached;
  }

  const directory = join(tmpdir(), "commshub99");
  const outputPath = join(directory, `contacts-${randomUUID()}.json`);

  await mkdir(dirname(outputPath), { recursive: true });

  try {
    await callContactsMcpTool<{ exported: number }>("export_contacts", {
      format: "json",
      includeArchived: false,
      outputPath,
    });

    const contacts = JSON.parse(await readFile(outputPath, "utf8")) as ContactsMcpContact[];

    contactsCache = {
      contacts,
      fetchedAt: Date.now(),
    };

    return contacts;
  } catch (error) {
    const staleContacts = contactsCache?.contacts;

    if (staleContacts) {
      return staleContacts;
    }

    throw error instanceof ContactsMcpClientError
      ? error
      : new ContactsMcpClientError(
          "contacts_export_failed",
          error instanceof Error ? error.message : "Could not export contacts",
          error,
        );
  } finally {
    await rm(outputPath, { force: true });
  }
}

export function clearContactsMcpCacheForTest() {
  contactsCache = undefined;
}
