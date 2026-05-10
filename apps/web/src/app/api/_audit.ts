// SPDX-License-Identifier: AGPL-3.0-or-later
import { tryWriteDraftMutationAudit, type WriteDraftMutationAuditInput } from "@commshub99/core";

export function writeRouteDraftMutationAudit(input: WriteDraftMutationAuditInput) {
  const result = tryWriteDraftMutationAudit(input);

  if (!result.ok) {
    console.warn(`Audit log write failed for ${input.action}: ${result.error.message}`);
  }
}
