# Conversation Architecture

commshub99 is organized around people and parties, not around a single chat vendor.

## Core Objects

- **Contact**: the canonical person, business, service, or agent in our system. A contact can have many identifiers across channels: phone numbers, emails, Discord users, Slack users, Telegram handles, and future sources.
- **Conversation**: a channel-native room/thread/mailbox view where messages happen. A conversation belongs to one adapter and keeps the adapter's stable native ID. It may be a one-to-one chat, group, channel, email thread, or future communication surface.
- **Message**: an event inside a conversation. Direction is always from the signed-in user's perspective: `outbound` means the user/account sent it, `inbound` means another participant sent it.
- **Context**: policy and memory layered over contacts and conversations. Contact context follows the party across channels. Conversation context is for room/group/thread-specific overrides.

## Identity Rules

The UI must never treat the signed-in user as the remote party in their own conversations. Adapters should identify self from explicit account identity and, when needed, from channel-local evidence such as a contact match that appears across every matched iMessage chat.

Contacts are the stable cross-channel grouping layer. Adapter identifiers should flow into contacts through match tables or correction overrides, not directly become user-facing top-level identities forever.

## Display Rules

The Conversations view is a messaging app surface:

- The left pane lists conversations, not individual messages or contacts.
- Each row is labeled by the other party or group name, with a preview of the latest message.
- Outbound previews are labeled as `You: ...`.
- Selecting a row loads that exact conversation on the right.
- Invalid or stale conversation URLs show a not-found state instead of falling back to the latest conversation.
- The detail header links to the associated contact when known and to that conversation's context override.

## Adapter Boundary

Adapters translate native channel data into the shared core types. They should preserve native IDs for routing and context keys, but hide channel quirks from the UI. As more adapters land, the web app should consume the same concepts for iMessage, Discord, Telegram, Slack, email, and other platforms.
