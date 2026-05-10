// SPDX-License-Identifier: AGPL-3.0-or-later
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveImessageDataPath() {
  return process.env.IMSG_DATA_DIR ?? join(homedir(), "imsg-data");
}

export function resolveImessageChatsPath() {
  return join(resolveImessageDataPath(), "chats");
}

export function resolveImessageDatabasePath() {
  return join(resolveImessageDataPath(), "imessage.sqlite");
}
