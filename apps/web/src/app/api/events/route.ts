// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { requireAuthenticatedRequest } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pollIntervalMs = 10_000;

function imsgDataDir() {
  return process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
}

function collectFileState(directory: string, rows: string[]) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      collectFileState(path, rows);
      continue;
    }

    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }

    const stat = statSync(path);

    rows.push(`${path}:${stat.mtimeMs}:${stat.size}`);
  }
}

function approvalStateSignature() {
  const root = imsgDataDir();
  const rows: string[] = [];

  for (const directory of ["chats", "outbox", "rejected", "sent", "errors"]) {
    collectFileState(join(root, directory), rows);
  }

  return rows.sort().join("|");
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const auth = requireAuthenticatedRequest(request);

  if (auth.response) {
    return auth.response;
  }

  const encoder = new TextEncoder();
  let lastSignature = approvalStateSignature();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(sse("ready", { signature: lastSignature, timestamp: new Date() })),
      );

      const interval = setInterval(() => {
        const signature = approvalStateSignature();

        if (signature === lastSignature) {
          return;
        }

        lastSignature = signature;
        controller.enqueue(encoder.encode(sse("approvals", { timestamp: new Date() })));
      }, pollIntervalMs);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
}
