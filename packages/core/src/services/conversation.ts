// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AdapterRegistry, ListConversationsOptions } from "../registry.js";
import type { Conversation } from "../types.js";

export class ConversationService {
  constructor(private readonly registry: AdapterRegistry) {}

  async list(options?: ListConversationsOptions): Promise<Conversation[]> {
    const conversations = (
      await Promise.all(this.registry.list().map((adapter) => adapter.listConversations(options)))
    ).flat();

    conversations.sort(
      (left, right) => Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt),
    );

    return typeof options?.limit === "number"
      ? conversations.slice(0, options.limit)
      : conversations;
  }
}
