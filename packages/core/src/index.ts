// SPDX-License-Identifier: AGPL-3.0-or-later

export {
  type SelfPerspective,
  type SelfPerspectiveUser,
  selfPerspectiveFromUser,
} from "./identity.js";
export {
  AdapterRegistry,
  type ChannelAdapter,
  channelIdFromResourceId,
  type DraftApprovalResult,
  type ListConversationsOptions,
  type ListMessagesOptions,
  type ListProposedMessagesOptions,
} from "./registry.js";
export {
  type DraftMutationAuditAction,
  type TryWriteAuditLogResult,
  tryWriteAuditLog,
  tryWriteDraftMutationAudit,
  type WriteAuditLogInput,
  type WriteDraftMutationAuditInput,
  writeAuditLog,
  writeDraftMutationAudit,
} from "./services/audit.js";
export {
  ContextService,
  contextBundleToDraftSnapshot,
  type ResolveContextInput,
  type ResolvedContextBundle,
} from "./services/context.js";
export {
  type ContextHarvestSuggestion,
  type HarvestConversationInput,
  type HarvestMessage,
  harvestContextSuggestions,
} from "./services/context-harvest.js";
export {
  ContextHistoryService,
  type ListContextVersionsInput,
  type RecordContextVersionInput,
} from "./services/context-history.js";
export { ConversationService } from "./services/conversation.js";
export { DraftService } from "./services/draft.js";
export { MessageService } from "./services/message.js";
export {
  type CreateScheduledSendInput,
  type ScheduledSendRecord,
  type ScheduledSendStatus,
  ScheduleService,
} from "./services/schedule.js";
export {
  type Attachment,
  attachmentSchema,
  type ChannelId,
  type ContactContext,
  type ContextDeliveryService,
  type ContextHistoryOperation,
  type ContextHistorySource,
  type ContextProfile,
  type ContextRelationshipCategory,
  type ContextReplyPosture,
  type ContextReviewStatus,
  type ContextSignatureMode,
  type ContextTone,
  type ContextType,
  type ContextVersion,
  type Conversation,
  type ConversationContext,
  type ConversationMessage,
  channelIdSchema,
  contactContextSchema,
  contextDeliveryServiceSchema,
  contextHistoryOperationSchema,
  contextHistorySourceSchema,
  contextProfileSchema,
  contextRelationshipCategorySchema,
  contextReplyPostureSchema,
  contextReviewStatusSchema,
  contextSignatureModeSchema,
  contextToneSchema,
  contextTypeSchema,
  contextVersionSchema,
  conversationContextSchema,
  conversationMessageSchema,
  conversationSchema,
  type DraftContextSnapshot,
  draftContextSnapshotSchema,
  type LinkedContact,
  linkedContactSchema,
  type Message,
  type MessageDirection,
  messageDirectionSchema,
  messageSchema,
  type Participant,
  type PersonalDetailBoundary,
  type ProposedMessage,
  type ProposedMessageStatus,
  participantSchema,
  personalDetailBoundarySchema,
  proposedMessageSchema,
  proposedMessageStatusSchema,
  type Reaction,
  reactionSchema,
} from "./types.js";
export {
  type RunDueScheduledSendsOptions,
  runDueScheduledSends,
} from "./workers/schedule.js";
