// SPDX-License-Identifier: AGPL-3.0-or-later
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

const databasePath =
  process.env.COMMSHUB99_DB_PATH ??
  process.env.DATABASE_URL ??
  join(homedir(), ".commshub99", "hub.db");

export default defineConfig({
  schema: "./src/schema/**/*.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: databasePath,
  },
  strict: true,
  verbose: true,
});
