// SPDX-License-Identifier: AGPL-3.0-or-later
import { tryWriteAuditLog, type WriteAuditLogInput } from "@commshub99/core";

export function writeRouteAuditLog(input: WriteAuditLogInput) {
  const result = tryWriteAuditLog(input);

  if (!result.ok) {
    console.warn(`Audit log write failed for ${input.action}: ${result.error.message}`);
  }
}
