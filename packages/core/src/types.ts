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
  isGroup: z.boolean(),
  lastMessage: z.string(),
  lastMessageAt: z.string(),
  lastMessageDirection: messageDirectionSchema.nullable(),
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

export const contextRelationshipCategorySchema = z.enum([
  "family",
  "friend",
  "professional",
  "service",
  "unknown",
]);
export type ContextRelationshipCategory = z.infer<typeof contextRelationshipCategorySchema>;

export const contextToneSchema = z.enum(["polite", "warm", "direct", "terse", "avoid_rude"]);
export type ContextTone = z.infer<typeof contextToneSchema>;

export const contextReplyPostureSchema = z.enum([
  "do_not_reply",
  "reply_if_needed",
  "usually_reply",
  "always_reply",
]);
export type ContextReplyPosture = z.infer<typeof contextReplyPostureSchema>;

export const personalDetailBoundarySchema = z.enum([
  "location",
  "health_updates",
  "daily_agenda",
  "family_updates",
]);
export type PersonalDetailBoundary = z.infer<typeof personalDetailBoundarySchema>;

export const contextSignatureModeSchema = z.enum(["inherit", "append", "override"]);
export type ContextSignatureMode = z.infer<typeof contextSignatureModeSchema>;

export const contextDeliveryServiceSchema = z.enum(["inherit", "auto", "imessage", "sms"]);
export type ContextDeliveryService = z.infer<typeof contextDeliveryServiceSchema>;

export const contextProfileSchema = z.object({
  allowedPersonalDetails: z.array(personalDetailBoundarySchema),
  customPersonalDetails: z.array(z.string()),
  customPrompt: z.string(),
  deliveryService: contextDeliveryServiceSchema,
  displayName: z.string(),
  id: z.string(),
  notes: z.string(),
  relationship: contextRelationshipCategorySchema,
  replyPosture: contextReplyPostureSchema,
  signatureMode: contextSignatureModeSchema,
  signatureValue: z.string(),
  tenantId: z.string(),
  tone: contextToneSchema,
  updatedAt: z.string(),
});
export type ContextProfile = z.infer<typeof contextProfileSchema>;

export const contactContextSchema = contextProfileSchema.extend({
  contactKey: z.string(),
  scope: z.literal("contact"),
});
export type ContactContext = z.infer<typeof contactContextSchema>;

export const conversationContextSchema = contextProfileSchema.extend({
  channelId: channelIdSchema,
  roomKey: z.string(),
  scope: z.literal("conversation"),
});
export type ConversationContext = z.infer<typeof conversationContextSchema>;

export const contextTypeSchema = z.enum(["contact", "conversation"]);
export type ContextType = z.infer<typeof contextTypeSchema>;

export const contextHistoryOperationSchema = z.enum(["create", "update", "delete", "rollback"]);
export type ContextHistoryOperation = z.infer<typeof contextHistoryOperationSchema>;

export const contextHistorySourceSchema = z.enum(["human", "harvest", "import", "system"]);
export type ContextHistorySource = z.infer<typeof contextHistorySourceSchema>;

export const contextReviewStatusSchema = z.enum(["pending", "approved", "rejected", "superseded"]);
export type ContextReviewStatus = z.infer<typeof contextReviewStatusSchema>;

export const contextVersionSchema = z.object({
  actorUserId: z.string().nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  contextId: z.string(),
  contextType: contextTypeSchema,
  createdAt: z.string(),
  id: z.string(),
  operation: contextHistoryOperationSchema,
  reviewStatus: contextReviewStatusSchema,
  source: contextHistorySourceSchema,
  tenantId: z.string(),
});
export type ContextVersion = z.infer<typeof contextVersionSchema>;

export const draftContextSnapshotSchema = z.object({
  allowedPersonalDetails: z.array(personalDetailBoundarySchema),
  contactContextIds: z.array(z.string()),
  contextVersionIds: z.array(z.string()),
  customPersonalDetails: z.array(z.string()),
  customPrompt: z.string(),
  deliveryService: contextDeliveryServiceSchema,
  notes: z.string(),
  replyPosture: contextReplyPostureSchema,
  signature: z.string(),
  source: z.enum(["draft_metadata", "live"]),
  tenantId: z.string(),
  tone: contextToneSchema,
  conversationContextId: z.string().nullable(),
});
export type DraftContextSnapshot = z.infer<typeof draftContextSnapshotSchema>;

export const proposedMessageSchema = z.object({
  approved: z.boolean(),
  chatId: z.string(),
  context: draftContextSnapshotSchema.nullable().optional(),
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
