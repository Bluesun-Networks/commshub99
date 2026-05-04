// SPDX-License-Identifier: AGPL-3.0-or-later
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDbClient } from "./client.js";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

const client = createDbClient();

try {
  migrate(client.db, { migrationsFolder });
  console.log(`Applied migrations to ${client.path}`);
} finally {
  client.close();
}
