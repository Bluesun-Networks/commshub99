// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ChannelId, Conversation, Message, ProposedMessage } from "./types.js";

export type ListConversationsOptions = {
  limit?: number;
  tenantId?: string;
};

export type ListMessagesOptions = {
  after?: Date;
  before?: Date;
  limit?: number;
};

export type ListProposedMessagesOptions = {
  limit?: number;
  tenantId?: string;
};

export type DraftApprovalResult = {
  alreadyCompleted?: boolean;
  id: string;
};

export interface ChannelAdapter {
  readonly id: ChannelId;
  readonly displayName: string;
  listConversations(options?: ListConversationsOptions): Promise<Conversation[]>;
  listMessages(conversationId: string, options?: ListMessagesOptions): Promise<Message[]>;
  listProposedMessages?(options?: ListProposedMessagesOptions): Promise<ProposedMessage[]>;
  approveProposedMessage?(id: string): Promise<DraftApprovalResult>;
  rejectProposedMessage?(id: string, reason?: string): Promise<DraftApprovalResult>;
}

export class AdapterRegistry {
  readonly #adapters = new Map<ChannelId, ChannelAdapter>();

  register(adapter: ChannelAdapter) {
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`Adapter already registered for channel ${adapter.id}`);
    }

    this.#adapters.set(adapter.id, adapter);
  }

  get(channelId: ChannelId) {
    const adapter = this.#adapters.get(channelId);

    if (!adapter) {
      throw new Error(`No adapter registered for channel ${channelId}`);
    }

    return adapter;
  }

  list() {
    return [...this.#adapters.values()];
  }

  forResourceId(id: string) {
    return this.get(channelIdFromResourceId(id));
  }
}

export function channelIdFromResourceId(id: string): ChannelId {
  const [channelId] = id.split(":");

  if (
    channelId === "imessage" ||
    channelId === "discord" ||
    channelId === "email" ||
    channelId === "whatsapp" ||
    channelId === "sms" ||
    channelId === "slack" ||
    channelId === "signal"
  ) {
    return channelId;
  }

  throw new Error(`Resource id is missing a known channel prefix: ${id}`);
}
