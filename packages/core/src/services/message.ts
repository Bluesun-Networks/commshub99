// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AdapterRegistry, ListMessagesOptions } from "../registry.js";
import type { Message } from "../types.js";

export class MessageService {
  constructor(private readonly registry: AdapterRegistry) {}

  async list(conversationId: string, options?: ListMessagesOptions): Promise<Message[]> {
    return this.registry.forResourceId(conversationId).listMessages(conversationId, options);
  }
}
