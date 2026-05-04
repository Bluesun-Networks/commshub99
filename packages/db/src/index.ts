// SPDX-License-Identifier: AGPL-3.0-or-later

export type { CreateDbClientOptions, DbClient, ResolveDatabasePathOptions } from "./client.js";
export {
  createDbClient,
  DEFAULT_DATA_DIR,
  DEFAULT_DATABASE_FILENAME,
  resolveDatabasePath,
} from "./client.js";
export * from "./schema/index.js";
