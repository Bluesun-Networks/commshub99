// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { AdapterRegistry, type ChannelAdapter } from "./registry.js";
import { ConversationService } from "./services/conversation.js";
import { DraftService } from "./services/draft.js";
import { MessageService } from "./services/message.js";
import type { ChannelId, Conversation, Message, ProposedMessage } from "./types.js";

function conversation(id: string, lastMessageAt: string): Conversation {
  return {
    channel: id.split(":")[0] ?? "imessage",
    contact: "Ada Lovelace",
    handle: "+15551234567",
    id,
    isGroup: false,
    lastMessage: "Hello",
    lastMessageAt,
    lastMessageDirection: "inbound",
    linkedContact: null,
    messageCount: 1,
    messages: [],
    status: "matched",
    unreadCount: 0,
  };
}

function message(conversationId: string): Message {
  return {
    attachments: [],
    body: "Hello",
    channelId: conversationId.startsWith("discord:") ? "discord" : "imessage",
    conversationId,
    direction: "inbound",
    id: `${conversationId}:message:1`,
    sender: {
      displayName: "Ada Lovelace",
      id: "participant-1",
    },
    sentAt: new Date("2026-05-10T20:00:00Z"),
  };
}

function draft(id: string, createdAt: string): ProposedMessage {
  return {
    approved: false,
    chatId: id,
    createdAt,
    displayCreatedAt: createdAt,
    displaySourceMessageAt: "",
    model: "gpt-5.5",
    reasoning: "",
    sourceMessageAt: "",
    sourceRowid: null,
    targetIdentifier: "+15551234567",
    text: "Hello",
    uuid: id,
  };
}

function adapter(id: ChannelId, overrides: Partial<ChannelAdapter> = {}): ChannelAdapter {
  return {
    displayName: id,
    id,
    listConversations: async () => [],
    listMessages: async (conversationId) => [message(conversationId)],
    ...overrides,
  };
}

describe("AdapterRegistry", () => {
  it("rejects duplicate adapter ids", () => {
    const registry = new AdapterRegistry();

    registry.register(adapter("imessage"));

    expect(() => registry.register(adapter("imessage"))).toThrow("already registered");
  });

  it("routes resource ids by their channel prefix", async () => {
    const registry = new AdapterRegistry();
    const calls: string[] = [];

    registry.register(adapter("imessage"));
    registry.register(
      adapter("discord", {
        listMessages: async (conversationId) => {
          calls.push(conversationId);
          return [message(conversationId)];
        },
      }),
    );

    const messages = await new MessageService(registry).list("discord:channel:1");

    expect(calls).toEqual(["discord:channel:1"]);
    expect(messages[0]?.channelId).toBe("discord");
  });
});

describe("ConversationService", () => {
  it("merges registered adapters and sorts newest first", async () => {
    const registry = new AdapterRegistry();

    registry.register(
      adapter("imessage", {
        listConversations: async () => [conversation("imessage:chat:1", "2026-05-10T20:00:00Z")],
      }),
    );
    registry.register(
      adapter("discord", {
        listConversations: async () => [conversation("discord:dm:1", "2026-05-10T21:00:00Z")],
      }),
    );

    const conversations = await new ConversationService(registry).list();

    expect(conversations.map((item) => item.id)).toEqual(["discord:dm:1", "imessage:chat:1"]);
  });
});

describe("DraftService", () => {
  it("lists proposed messages across capable adapters", async () => {
    const registry = new AdapterRegistry();

    registry.register(adapter("imessage"));
    registry.register(
      adapter("discord", {
        listProposedMessages: async () => [draft("discord:draft:1", "2026-05-10T21:00:00Z")],
      }),
    );

    const drafts = await new DraftService(registry).list();

    expect(drafts.map((item) => item.uuid)).toEqual(["discord:draft:1"]);
  });

  it("routes approve calls to the owning adapter", async () => {
    const registry = new AdapterRegistry();
    const calls: string[] = [];

    registry.register(
      adapter("imessage", {
        approveProposedMessage: async (id) => {
          calls.push(id);
          return { id };
        },
      }),
    );

    await new DraftService(registry).approve("imessage:draft:1");

    expect(calls).toEqual(["imessage:draft:1"]);
  });
});
