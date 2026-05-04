# Channel adapters

A **channel adapter** plugs a single communications channel — iMessage, Discord, email, SMS, WhatsApp, Slack, Signal, and whatever comes next — into commshub99. Adapters are the project's main extension point. This document is the contract.

If you are *adding* a channel, this is the document. If you are *changing* the contract, every adapter in the repo and this document must be updated in the same PR.

## What an adapter is

An adapter is a TypeScript package at `packages/adapters/<channel-id>/` that:

1. Exports a class implementing the `ChannelAdapter` interface.
2. Declares its `capabilities` honestly — the registry trusts these flags at runtime.
3. Translates the channel's native data shape into commshub99's channel-agnostic types (`Conversation`, `Message`, `ProposedMessage`, `Participant`).
4. Owns *all* I/O for its channel. The core has no idea how iMessage stores a chat or how Discord paginates a DM history.

An adapter is **not**:
- An LLM or agent. Adapters do not generate proposed messages. Drafts come from upstream agents (imsg-agent, future commsbot99) and arrive in whatever location/shape the channel uses; the adapter's job is to *surface* them.
- The send transport for outgoing messages, in most cases. For iMessage, imsg-agent's existing send loop watches `~/imsg-data/outbox/` and does the actual sending; the adapter just moves files there. Other channels may need to send via their own API — that's allowed, but the adapter must still gate every send behind an explicit `approveMessage` call.

## The interface

Located at `packages/adapters/_contract/src/index.ts`. Sketch (the canonical version is the code; this is the explainer):

```ts
import type { z } from 'zod';

export type ChannelId = string;          // 'imessage' | 'discord' | …; opaque to the core

export interface ChannelCapabilities {
  /** The adapter can list past conversations. Should be true for every adapter. */
  readonly listConversations: boolean;

  /** The adapter can fetch message history for a conversation. */
  readonly listMessages: boolean;

  /** The adapter can full-text search messages without round-tripping every result. */
  readonly searchMessages: boolean;

  /** The adapter surfaces drafts proposed by an upstream agent. */
  readonly proposedMessages: boolean;

  /** Adapter implements `approveMessage`. If false, the channel is read-only. */
  readonly approveMessage: boolean;

  /** Adapter implements `rejectMessage`. */
  readonly rejectMessage: boolean;

  /** Adapter implements `scheduleMessage`. If false, the hub won't offer scheduling for this channel. */
  readonly scheduleMessage: boolean;

  /** Adapter pushes real-time events (new message, draft state change). */
  readonly subscribe: boolean;

  /** Adapter can map a raw handle to a contact ID. */
  readonly resolveHandle: boolean;

  /** Channel supports reactions / tapbacks. */
  readonly reactions: boolean;

  /** Channel supports attachments larger than text. */
  readonly attachments: boolean;
}

export interface ChannelAdapter {
  readonly id: ChannelId;
  readonly displayName: string;
  readonly capabilities: ChannelCapabilities;

  /** Called once at startup. Open files, validate config, throw on misconfiguration. */
  init(ctx: AdapterContext): Promise<void>;

  /** Called at shutdown. Release file handles, close DBs, kill child processes. */
  shutdown(): Promise<void>;

  /** Lightweight liveness check. Used by the /health endpoint. */
  health(): Promise<HealthStatus>;

  // ---- Read ----
  listConversations(opts?: ListConversationsOpts): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation>;
  listMessages(conversationId: string, opts?: ListMessagesOpts): Promise<Message[]>;
  searchMessages?(query: string, opts?: SearchMessagesOpts): Promise<Message[]>;

  // ---- Drafts ----
  listProposedMessages?(opts?: ListProposedOpts): Promise<ProposedMessage[]>;
  getProposedMessage?(id: string): Promise<ProposedMessage>;

  // ---- Mutations (each gated by capability flag) ----
  approveMessage?(id: string, edits?: MessageEdits): Promise<ApproveResult>;
  rejectMessage?(id: string, reason?: string): Promise<void>;
  scheduleMessage?(id: string, sendAt: Date): Promise<ScheduleResult>;
  cancelScheduled?(scheduleId: string): Promise<void>;

  // ---- Identity ----
  resolveHandle?(handle: string): Promise<ResolvedHandle | null>;

  // ---- Real-time ----
  subscribe?(callback: (event: ChannelEvent) => void): Unsubscribe;
}

export interface AdapterContext {
  /** Tenant scope for this adapter instance. */
  readonly tenantId: string;

  /** Per-tenant config from the `channel_configs` table. */
  readonly config: Record<string, unknown>;

  /** Logger pre-bound with `{ tenant, channel }`. */
  readonly log: Logger;

  /** Helper for resolving phone/email handles to contacts via contacts-mcp. */
  readonly contacts: ContactsResolver;
}

export type Unsubscribe = () => void;

export type ChannelEvent =
  | { type: 'message:new';           message: Message }
  | { type: 'conversation:updated';  conversation: Conversation }
  | { type: 'draft:new';             draft: ProposedMessage }
  | { type: 'draft:updated';         draft: ProposedMessage };
```

Channel-agnostic types (`Conversation`, `Message`, `ProposedMessage`, `Participant`, etc.) live in `packages/core/src/types.ts` and are sketched in [PLAN.md § Domain model](../PLAN.md#domain-model-packagescore).

## Conventions every adapter must follow

### IDs

Adapter-prefixed, colon-separated, channel-stable:

- Conversations: `<channel-id>:<native-id>` — e.g. `imessage:42`, `discord:1140293847`.
- Messages: `<channel-id>:msg:<native-id>` — e.g. `imessage:msg:81234`.
- Drafts: `<channel-id>:draft:<uuid>` — e.g. `imessage:draft:f7b9-…`.

The prefix is what `AdapterRegistry` uses to route a request from the core to the right adapter. Never strip the prefix when storing IDs in the hub's own DB.

### Capability honesty

`capabilities.scheduleMessage = true` means: the `scheduleMessage` method is implemented, the channel supports it, and the hub may surface scheduling UI for this channel. If your adapter's channel API doesn't support delayed send, set the flag false; the hub's scheduling worker can fall back to "send-when-due" using `approveMessage`, but only if the adapter declares so via a separate flag (`virtualSchedule: true`, TBD).

If a capability flag changes between releases, bump the adapter's major version. The registry checks compatibility at startup and refuses to load mismatched versions.

### No I/O at construction time

`new MyAdapter(...)` must be cheap and side-effect-free. All I/O happens in `init()`. This is what lets the registry compose adapters, validate them, and fail fast on misconfiguration without leaking resources.

### Idempotency

`approveMessage` must be idempotent for the same draft ID. If an approve crashes mid-flight, retrying must be safe. For the iMessage adapter this means: check whether the file already exists in `outbox/` before moving from `drafts/`; treat that as success.

`rejectMessage` is also idempotent. Rejecting an already-rejected draft is a no-op.

### Atomic file operations

Any adapter that writes to disk uses **atomic rename**: write to a temp file in the same directory, fsync if applicable, then rename. A crash mid-write must never leave a half-formed file in `outbox/`.

### Error taxonomy

Throw the typed errors from `packages/core/src/errors.ts`:

- `NotFoundError` — the requested ID doesn't exist.
- `PermissionError` — the channel API rejected us. (Note: hub-level permissions are checked *above* the adapter; this is for upstream-API auth failures.)
- `ConflictError` — state mismatch, e.g. trying to approve a draft already moved.
- `ValidationError` — bad input.
- `UpstreamError` — anything else from the channel API. Include the original error as `cause`.

### Logging

`ctx.log` is pre-bound with `{ tenant, channel }`. Add structured fields per call (`{ conversationId }`, `{ draftId }`). **Never log message bodies, draft contents, or PII.** IDs, status codes, durations are fine; content is not.

### Tests

Each adapter ships fixture-based integration tests under `packages/adapters/<channel-id>/test/`. For iMessage, fixtures are seeded SQLite files. For network channels, use [`msw`](https://mswjs.io/) or a recorded-cassette pattern; do not hit live APIs in CI.

## Authoring a new adapter

1. **Open an issue first** with a one-page design: what auth flow, what the native ID model is, how identity resolution works (handle → contact), what capabilities you'll claim, what the security boundary looks like.
2. **Copy the template.** `packages/adapters/_contract/template/` is a working skeleton; copy to `packages/adapters/<your-channel>/`.
3. **Implement read-path first.** `listConversations`, `getConversation`, `listMessages`. Get the UI showing real data before touching mutations.
4. **Add identity resolution.** `resolveHandle` should call `ctx.contacts.resolve(...)` and return a `ContactRef` if found. Without this, conversations show raw handles instead of names.
5. **Add drafts.** Define how drafts arrive in your channel — file watcher, webhook, polling — and implement `listProposedMessages` + `subscribe`.
6. **Add mutations.** `approveMessage`, `rejectMessage`, `scheduleMessage`. Each goes through the audit log via the core's `DraftService`; the adapter only does the channel-specific transport.
7. **Capability flags.** Set them last, when the implementation matches reality.
8. **Tests.** Fixtures, CI, axe-core for any UI you added.
9. **Docs.** Add a section to [docs/deployment.md](deployment.md) explaining required credentials and config. Update this file if the contract needed clarification.
10. **Register the adapter.** `apps/web/src/server/bootstrap.ts` registers adapters at startup behind a config flag. Default: disabled.

## Anti-patterns

- **Don't put business logic in adapters.** Permission checks, audit logging, schedule queuing live in `packages/core`. The adapter only knows about its channel.
- **Don't share state across adapters.** Each adapter is per-tenant, per-channel. Cross-channel features (e.g. "this person across all channels") live in the core.
- **Don't mutate channel-agnostic types.** Adapters return them; the core treats them as immutable.
- **Don't leak channel concepts upward.** If `Conversation.title` makes sense everywhere, fine. If your channel has "voice rooms" that aren't really conversations, model them separately or skip them — don't pretend they're a `Conversation`.
- **Don't use the upstream's terminology in user-facing strings produced by the adapter.** That's UI's job. The adapter returns structured data; the UI labels it.

## Versioning the contract

The `ChannelAdapter` interface is versioned. The `_contract` package exports a `CONTRACT_VERSION` string. Every adapter declares the version it was built against. The registry compares at startup and refuses to load incompatible adapters.

When you change the contract:

1. Bump `CONTRACT_VERSION` (semver — patch for additive optionals, minor for new optional methods, major for breaking changes).
2. Update every adapter in this repo.
3. Update this document.
4. Note the change in `CHANGELOG.md` under a `### Adapter contract` heading.
5. For major bumps, write a migration note in `docs/migrations/contract-vN.md`.

## Open questions for adapter authors

These are unresolved and welcome design input:

- **Cross-channel identity.** A person reachable on iMessage, WhatsApp, and email is one `Contact` in contacts-mcp but three `Participant`s in three adapters. Should the core merge views, or stay channel-pure?
- **Reactions.** iMessage has tapbacks, Discord has emoji reactions, email has nothing. Worth a unified model, or per-channel UI?
- **Threading.** Email threads, Slack threads, iMessage replies are all different. v1 ignores threading; eventually it matters.
- **Drafts that span channels.** Could commsbot99 propose "send this to Alice on whichever channel she answers fastest"? If so, drafts need to be channel-late-bound.
- **Encrypted channels (Signal).** No archive accessible from outside the app. Likely requires a Signal-on-the-Mac approach similar to imsg-agent's iMessage approach.

When you hit one of these in your adapter work, file an issue and link from here.
