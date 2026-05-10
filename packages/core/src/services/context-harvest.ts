// SPDX-License-Identifier: AGPL-3.0-or-later
import type {
  ChannelId,
  ContextRelationshipCategory,
  ContextReplyPosture,
  ContextTone,
  PersonalDetailBoundary,
} from "../types.js";

export interface HarvestMessage {
  direction: "inbound" | "outbound";
  rowid: number;
  sentAt: string;
  text: string;
}

export interface HarvestConversationInput {
  channelId: ChannelId;
  contactKey?: string | null;
  displayName: string;
  isGroup: boolean;
  messages: HarvestMessage[];
  roomKey: string;
}

export interface ContextHarvestSuggestion {
  confidence: number;
  contextType: "contact" | "conversation";
  evidence: Array<{
    rowid: number;
    snippet: string;
  }>;
  payload: {
    allowedPersonalDetails: PersonalDetailBoundary[];
    customPrompt: string;
    displayName: string;
    relationship: ContextRelationshipCategory;
    replyPosture: ContextReplyPosture;
    tone: ContextTone;
  };
  source: "harvest";
  targetKey: string;
}

function includesAny(text: string, words: string[]) {
  const normalized = text.toLowerCase();

  return words.some((word) => normalized.includes(word));
}

function snippet(text: string) {
  return text.trim().replace(/\s+/g, " ").slice(0, 140);
}

function confidence(value: number) {
  return Math.max(0.1, Math.min(0.95, Number(value.toFixed(2))));
}

function relationshipFor(
  messages: HarvestMessage[],
  isGroup: boolean,
): ContextRelationshipCategory {
  const text = messages.map((message) => message.text).join(" ");

  if (includesAny(text, ["mom", "dad", "family", "love you", "birthday", "dinner"])) {
    return "family";
  }

  if (includesAny(text, ["meeting", "invoice", "client", "contract", "deadline"])) {
    return "professional";
  }

  if (includesAny(text, ["appointment", "delivery", "verification", "receipt"])) {
    return "service";
  }

  return isGroup ? "friend" : "unknown";
}

function toneFor(messages: HarvestMessage[]): ContextTone {
  const outbound = messages.filter((message) => message.direction === "outbound");
  const text = outbound.map((message) => message.text).join(" ");
  const averageLength =
    outbound.reduce((sum, message) => sum + message.text.length, 0) / Math.max(outbound.length, 1);

  if (includesAny(text, ["please", "thanks", "thank you", "appreciate"])) {
    return "polite";
  }

  if (averageLength < 32 && outbound.length > 0) {
    return "terse";
  }

  if (includesAny(text, ["sounds good", "happy to", "love", "great"])) {
    return "warm";
  }

  return "direct";
}

function replyPostureFor(messages: HarvestMessage[]): ContextReplyPosture {
  const inbound = messages.filter((message) => message.direction === "inbound").length;
  const outbound = messages.filter((message) => message.direction === "outbound").length;

  if (inbound > 0 && outbound === 0) {
    return "reply_if_needed";
  }

  if (outbound >= inbound && outbound > 2) {
    return "usually_reply";
  }

  return "reply_if_needed";
}

function allowedDetailsFor(messages: HarvestMessage[]) {
  const text = messages.map((message) => message.text).join(" ");
  const details: PersonalDetailBoundary[] = [];

  if (includesAny(text, ["where are you", "at home", "location", "on my way"])) {
    details.push("location");
  }

  if (includesAny(text, ["doctor", "health", "medicine", "sick"])) {
    details.push("health_updates");
  }

  if (includesAny(text, ["today", "tomorrow", "schedule", "agenda", "meeting"])) {
    details.push("daily_agenda");
  }

  if (includesAny(text, ["family", "mom", "dad", "kids"])) {
    details.push("family_updates");
  }

  return details;
}

function evidenceFor(messages: HarvestMessage[]) {
  return messages
    .filter((message) => message.text.trim())
    .slice(-3)
    .map((message) => ({
      rowid: message.rowid,
      snippet: snippet(message.text),
    }));
}

export function harvestContextSuggestions(
  conversations: HarvestConversationInput[],
): ContextHarvestSuggestion[] {
  return conversations.flatMap((conversation) => {
    const relationship = relationshipFor(conversation.messages, conversation.isGroup);
    const tone = toneFor(conversation.messages);
    const replyPosture = replyPostureFor(conversation.messages);
    const allowedPersonalDetails = allowedDetailsFor(conversation.messages);
    const evidence = evidenceFor(conversation.messages);
    const basePayload = {
      allowedPersonalDetails,
      customPrompt: "",
      displayName: conversation.displayName,
      relationship,
      replyPosture,
      tone,
    };
    const baseConfidence = confidence(0.35 + Math.min(conversation.messages.length, 12) * 0.04);
    const suggestions: ContextHarvestSuggestion[] = [
      {
        confidence: baseConfidence,
        contextType: "conversation",
        evidence,
        payload: basePayload,
        source: "harvest",
        targetKey: `${conversation.channelId}:${conversation.roomKey}`,
      },
    ];

    if (conversation.contactKey && !conversation.isGroup) {
      suggestions.unshift({
        confidence: baseConfidence,
        contextType: "contact",
        evidence,
        payload: basePayload,
        source: "harvest",
        targetKey: conversation.contactKey,
      });
    }

    return suggestions;
  });
}
