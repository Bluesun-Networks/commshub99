// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

export const channelIdSchema = z.enum([
  "imessage",
  "discord",
  "email",
  "whatsapp",
  "sms",
  "slack",
  "signal",
]);
export type ChannelId = z.infer<typeof channelIdSchema>;

export const messageDirectionSchema = z.enum(["inbound", "outbound"]);
export type MessageDirection = z.infer<typeof messageDirectionSchema>;

export const participantSchema = z.object({
  contactId: z.string().optional(),
  displayName: z.string(),
  handle: z.string().optional(),
  id: z.string(),
});
export type Participant = z.infer<typeof participantSchema>;

export const attachmentSchema = z.object({
  contentType: z.string().optional(),
  filename: z.string().optional(),
  id: z.string(),
  sizeBytes: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const reactionSchema = z.object({
  body: z.string(),
  from: participantSchema,
  id: z.string(),
});
export type Reaction = z.infer<typeof reactionSchema>;

export const conversationMessageSchema = z.object({
  body: z.string(),
  direction: messageDirectionSchema,
  id: z.string(),
  sentAt: z.string(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const linkedContactSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type LinkedContact = z.infer<typeof linkedContactSchema>;

export const conversationSchema = z.object({
  channel: z.string(),
  contact: z.string(),
  handle: z.string(),
  id: z.string(),
  lastMessage: z.string(),
  lastMessageAt: z.string(),
  linkedContact: linkedContactSchema.nullable(),
  messageCount: z.number().int().nonnegative(),
  messages: z.array(conversationMessageSchema),
  status: z.enum(["matched", "unmatched"]),
  unreadCount: z.number().int().nonnegative(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  attachments: z.array(attachmentSchema),
  body: z.string(),
  channelId: channelIdSchema,
  conversationId: z.string(),
  direction: messageDirectionSchema,
  id: z.string(),
  reactions: z.array(reactionSchema).optional(),
  replyToId: z.string().optional(),
  sender: participantSchema,
  sentAt: z.date(),
});
export type Message = z.infer<typeof messageSchema>;

export const proposedMessageStatusSchema = z.enum([
  "draft",
  "pending_review",
  "approved",
  "sent",
  "rejected",
  "failed",
  "scheduled",
]);
export type ProposedMessageStatus = z.infer<typeof proposedMessageStatusSchema>;

export const proposedMessageSchema = z.object({
  approved: z.boolean(),
  chatId: z.string(),
  createdAt: z.string(),
  displayCreatedAt: z.string(),
  displaySourceMessageAt: z.string(),
  model: z.string(),
  reasoning: z.string(),
  sourceMessageAt: z.string(),
  sourceRowid: z.number().int().nullable(),
  targetIdentifier: z.string(),
  text: z.string(),
  uuid: z.string(),
});
export type ProposedMessage = z.infer<typeof proposedMessageSchema>;
