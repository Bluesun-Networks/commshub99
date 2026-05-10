// SPDX-License-Identifier: AGPL-3.0-or-later
import type {
  AdapterRegistry,
  DraftApprovalResult,
  ListProposedMessagesOptions,
} from "../registry.js";
import type { ProposedMessage } from "../types.js";

export class DraftService {
  constructor(private readonly registry: AdapterRegistry) {}

  async list(options?: ListProposedMessagesOptions): Promise<ProposedMessage[]> {
    const drafts = (
      await Promise.all(
        this.registry
          .list()
          .filter((adapter) => adapter.listProposedMessages)
          .map((adapter) => adapter.listProposedMessages?.(options) ?? Promise.resolve([])),
      )
    ).flat();

    drafts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return typeof options?.limit === "number" ? drafts.slice(0, options.limit) : drafts;
  }

  async approve(id: string): Promise<DraftApprovalResult> {
    const adapter = this.registry.forResourceId(id);

    if (!adapter.approveProposedMessage) {
      throw new Error(`Adapter ${adapter.id} does not support approving proposed messages`);
    }

    return adapter.approveProposedMessage(id);
  }

  async reject(id: string, reason?: string): Promise<DraftApprovalResult> {
    const adapter = this.registry.forResourceId(id);

    if (!adapter.rejectProposedMessage) {
      throw new Error(`Adapter ${adapter.id} does not support rejecting proposed messages`);
    }

    return adapter.rejectProposedMessage(id, reason);
  }
}
