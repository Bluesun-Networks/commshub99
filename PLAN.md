# commshub99 — Architecture Plan

This document describes *what* commshub99 is and *how* it is built. For *why*, see [VISION.md](VISION.md). For *when*, see [ROADMAP.md](ROADMAP.md).

> **Status:** Pre-implementation. The repository is empty except for the AGPL license, README stub, and this planning set. All architectural choices below are starting points; revise them in PRs as the project evolves.

## At a glance

```
                  ┌────────────────────────────────────────┐
                  │            commshub99 monorepo         │
                  │                                        │
  Browser ──────► │  apps/web (Next.js)  ─┐                │
  Terminal ────► │  apps/cli (Ink TUI)  ─┼──► packages/core│
  commsbot99 ──► │  apps/mcp (MCP)      ─┘    │            │
                  │                            ▼            │
                  │                packages/adapters/*      │
                  │                packages/db (Drizzle)    │
                  │                packages/auth            │
                  └────────────┬───────────────┬────────────┘
                               │               │
                ┌──────────────▼──┐  ┌─────────▼──────────────┐
                │ ~/imsg-data/    │  │ ~/.contacts-mcp/store/ │
                │  imessage.sqlite│  │   (vCard files, git)   │
                │  drafts/*.md    │  │                        │
                │  outbox/*.md    │  └────────────────────────┘
                │  sent/*.md      │           ▲
                └─────────────────┘           │
                         ▲                    │
                         │             contacts-mcp
                  imsg-agent (Python)   (MCP stdio)
                  ── reads SQLite directly
                  ── reads/writes Markdown drafts
```

## Stack

| Layer            | Choice                                       | Rationale                                                                                                       |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Language         | TypeScript 5.7+                              | Single language across web, CLI, MCP server, adapters. Largest contributor pool for an OSS project.             |
| Runtime          | Node 22 LTS (production), Bun 1.x (dev)      | Bun for fast local dev and tests; Node for stable production deploys. Code stays runtime-agnostic where feasible. |
| Web framework    | Next.js 15 (App Router, RSC)                 | Mature accessibility tooling, SSR for fast first paint on dad's hardware, broad contributor familiarity.        |
| UI library       | React 19                                     | Same component model in web and TUI (via Ink).                                                                  |
| Styling          | Tailwind CSS + shadcn/ui (Radix primitives)  | Radix gives WCAG-compliant primitives out of the box. Tailwind keeps styling local.                             |
| Forms / state    | TanStack Query + React Hook Form + Zod       | Server state separated from form state. Zod schemas double as runtime validators and adapter contracts.         |
| TUI              | Ink 5                                        | React renderer for terminals. Reuses presentation logic from web.                                               |
| ORM              | Drizzle                                      | Typed SQL, low magic, SQLite-first with Postgres dialect ready when we scale.                                   |
| DB (own data)    | SQLite via `better-sqlite3`                  | Users, sessions, scheduled sends, audit, per-tenant config. Single file, easy backup.                           |
| DB (iMessage)    | `better-sqlite3` read-only                   | Direct read of `~/imsg-data/imessage.sqlite`. We never write to imsg-agent's archive.                           |
| Auth             | better-auth                                  | Plugin-based; start with email+password admin/readonly, extend to OAuth/OIDC later without rewrite.             |
| MCP              | `@modelcontextprotocol/sdk`                  | Server (for commsbot99 to drive us) and client (to talk to contacts-mcp).                                       |
| Real-time        | Server-Sent Events                           | Simpler than websockets, sufficient for new-message and draft-state pushes, works through reverse proxies.      |
| Tests            | Vitest (unit/integration) + Playwright (e2e) | Vitest aligns with contacts-mcp; Playwright for accessibility audits via axe.                                   |
| Lint / format    | Biome                                        | One tool replaces ESLint + Prettier; faster CI.                                                                 |
| Package manager  | Bun workspaces                              | One JavaScript toolchain for installs and scripts. Turborepo handles the task graph.                            |
| CI               | GitHub Actions                               | Matrix: linux-amd64, linux-arm64, macos-arm64.                                                                  |
| Container        | Distroless Node base image, multi-arch       | Minimal attack surface, AMD64 + ARM64 builds.                                                                   |

Anything on this list can be swapped if a contributor has a strong reason. The principles in [VISION.md](VISION.md) are the constraint; the stack serves them.

## Repository layout

```
commshub99/
├── apps/
│   ├── web/                 Next.js — primary surface
│   ├── cli/                 Ink TUI + commander CLI
│   └── mcp/                 MCP server (exposes hub to commsbot99)
├── packages/
│   ├── core/                Domain types, services, ports (no I/O)
│   ├── db/                  Drizzle schema + migrations for hub's own DB
│   ├── auth/                better-auth config + role/permission helpers
│   ├── ui/                  Shared React components (web + TUI splits where needed)
│   ├── mcp-client/          Wrapper for contacts-mcp and other MCP clients
│   └── adapters/
│       ├── _contract/       ChannelAdapter interface, capability flags, types
│       ├── imessage/        P0 — reads imsg-agent SQLite + Markdown drafts
│       ├── discord/         v1.0 — proof-of-pluggability
│       ├── email/           future
│       ├── whatsapp/        future
│       ├── sms/             future
│       ├── slack/           future
│       └── signal/          future
├── docs/
│   ├── channel-adapters.md  Interface contract + how to author one
│   ├── data-model.md        Hub's own DB schema + drafts state machine
│   ├── deployment.md        Single-Mac, Linux server, Docker
│   └── accessibility.md     WCAG targets, Essentials mode spec
├── tools/
│   └── scripts/             Dev scripts, migration helpers, seed data
├── .github/workflows/       CI matrix
├── CLAUDE.md                AI coding agent guide for this repo
├── PLAN.md                  This file
├── VISION.md                Principles
├── ROADMAP.md               Milestones
├── TODO.md                  Actionable tasks
└── README.md                Public entry point
```

## Data flow

### Reading iMessage conversations

1. Web/CLI/MCP request a conversation list.
2. `apps/*` calls `packages/core` ConversationService.
3. ConversationService asks the registered iMessage adapter.
4. iMessage adapter opens `~/imsg-data/imessage.sqlite` read-only via `better-sqlite3`, queries `chats` joined with `chat_contact_matches`, returns a normalized `Conversation[]`.
5. ConversationService enriches with contact details by calling `mcp-client` against contacts-mcp's `resolve_contact_points` tool (cached per request).
6. Result returns up the stack as channel-agnostic types.

### Reviewing and approving a draft

1. iMessage adapter watches `~/imsg-data/drafts/` (chokidar) and parses Markdown frontmatter into `ProposedMessage` objects.
2. Draft list pushed to clients via SSE.
3. User clicks **Approve** in the web UI.
4. Web app calls `apps/web/api/drafts/[id]/approve` route.
5. Route handler validates user permission (admin), calls `core.DraftService.approve(id, edits?)`.
6. DraftService asks the iMessage adapter to approve.
7. iMessage adapter (a) writes any edited body back to the Markdown file, (b) sets `approved: true` in frontmatter, (c) moves the file from `~/imsg-data/drafts/` to `~/imsg-data/outbox/`.
8. imsg-agent's existing send loop picks the file up and sends it. We do not implement send.
9. Audit row written to hub's own DB: who approved, when, with what edits.

### Scheduling a send

1. User picks **Schedule** instead of **Approve**, sets a future timestamp.
2. DraftService writes a row to hub DB: `scheduled_sends(id, draft_id, channel, send_at, status='pending', requested_by, requested_at)`.
3. The draft Markdown stays in `~/imsg-data/drafts/` with `approved: false`.
4. A background worker (`apps/mcp` hosts it; on the web tier in single-process deployments) wakes every 30s, finds rows where `send_at <= now() AND status='pending'`, and runs the same approve flow as above.
5. Status transitions: `pending → sent | failed | cancelled`. Failures retry with backoff up to N attempts, then leave the draft in `drafts/` and surface the error.

### Identity resolution

iMessage chats reference handles (`+15551234567`, `user@example.com`). contacts-mcp normalizes phones to E.164 and lowercases emails. The bridge is imsg-agent's `chat_contact_matches` table, which already stores `(chat_id, contact_id, status, confidence, matched_on, matched_value)`. The iMessage adapter:

1. Joins `chats` with `chat_contact_matches` to get a candidate `contact_id`.
2. If `status = 'matched'` with high confidence, fetches the contact from contacts-mcp by ID and uses its display name.
3. If unmatched or ambiguous, surfaces the raw handle and offers a "Link to contact" action that calls `contacts-mcp.search_contacts` and writes back into `chat_contact_matches`.

## Domain model (`packages/core`)

```ts
// Channel-agnostic types. Adapters convert their native shape to these.

interface Conversation {
  id: string;                    // adapter-prefixed: 'imessage:42'
  channelId: ChannelId;
  title: string;                 // contact display name or fallback handle
  participants: Participant[];
  lastMessageAt: Date;
  lastMessagePreview: string;
  isGroup: boolean;
  unreadCount?: number;
  contactId?: string;            // resolved via contacts-mcp
}

interface Message {
  id: string;
  conversationId: string;
  channelId: ChannelId;
  sender: Participant;
  body: string;
  sentAt: Date;
  direction: 'inbound' | 'outbound';
  attachments: Attachment[];
  reactions?: Reaction[];
  replyToId?: string;
}

interface ProposedMessage {
  id: string;                    // 'imessage:draft:<uuid>'
  conversationId: string;
  channelId: ChannelId;
  body: string;
  reasoning?: string;            // why the agent proposed this
  proposedAt: Date;
  proposedBy: 'imsg-agent' | string;
  status: 'draft' | 'pending_review' | 'approved' | 'sent' | 'rejected' | 'failed' | 'scheduled';
  scheduledFor?: Date;
  reviewedBy?: UserId;
  reviewedAt?: Date;
  edits?: { original: string; final: string };
}

type ChannelId = 'imessage' | 'discord' | 'email' | 'whatsapp' | 'sms' | 'slack' | 'signal';
```

See [docs/channel-adapters.md](docs/channel-adapters.md) for the full `ChannelAdapter` interface.

## Hub's own database

A single SQLite file (`~/.commshub99/hub.db` by default; configurable). Drizzle migrations versioned in `packages/db/migrations/`.

Tables:

- `users` — id, email, name, password_hash, role (`admin` | `readonly`), created_at, last_login_at, disabled.
- `sessions` — managed by better-auth.
- `tenants` — id, name, owner_user_id, created_at. (One row in v1; the column exists so we don't have to migrate later.)
- `tenant_users` — tenant_id, user_id, role.
- `scheduled_sends` — id, tenant_id, draft_ref (channel+id), send_at, status, attempts, last_error, requested_by, requested_at, sent_at.
- `audit_log` — id, tenant_id, user_id, action, target_type, target_id, payload_json, created_at. Append-only.
- `channel_configs` — tenant_id, channel_id, config_json, enabled. Where credentials and per-channel settings live.
- `contact_link_overrides` — tenant_id, channel_id, handle, contact_id, created_by, created_at. User-corrected handle→contact mappings that override `chat_contact_matches`.

Schema details and migration strategy in [docs/data-model.md](docs/data-model.md) (to be written).

## Auth and roles

- **better-auth** handles sessions and password hashing.
- Two roles in v1: `admin` (full read+write+approve+config) and `readonly` (browse only, no approval, no config).
- Permission checks live in `packages/auth/permissions.ts` as pure functions; every route handler and MCP tool calls one.
- Audit log captures every state-changing action with `user_id` and a JSON payload.
- Pluggable providers (OAuth, OIDC, magic links) added by configuring better-auth plugins; no code changes to call sites.

For the founding family deployment, the admin invites users by email; invitee sets a password on first sign-in. Remote access is over Tailscale or whatever the user's network allows; commshub99 does not bundle a tunnel.

## MCP server (`apps/mcp`)

Exposes the hub's domain to other agents (commsbot99 first). Tools:

- `list_pending_approvals(channel?, limit?)` → ProposedMessage[]
- `get_proposed_message(id)` → ProposedMessage
- `approve_message(id, edits?)` → { ok, sentAt? }
- `reject_message(id, reason?)` → { ok }
- `schedule_message(id, sendAt)` → { ok, scheduleId }
- `cancel_scheduled_message(scheduleId)` → { ok }
- `list_conversations(channel?, limit?)` → Conversation[]
- `search_messages(query, channel?, conversationId?, dateRange?)` → Message[]
- `list_audit_log(filters?, limit?)` → AuditEntry[]

All tool calls are authenticated (API token tied to a hub user) and audited. The MCP server enforces the same permission model as the web UI.

## Accessibility commitments

Founding user has Parkinson's. These are non-negotiable for v0.1:

- **Touch targets** ≥ 48×48 CSS pixels (WCAG 2.5.5 AAA), ≥ 8px spacing between adjacent targets.
- **Font scaling** 100%–200% in user preferences; layout never breaks.
- **Reduced motion** respected and the default in Essentials mode.
- **Focus rings** always visible, 3px minimum, 4.5:1 contrast.
- **Keyboard navigation** for every action. No mouse-only flows.
- **Confirmation** required for approve/send/reject. Confirmation has a 1.5s "are you sure" delay or a slide-to-confirm to defend against tremor double-clicks.
- **Auto-save** for any edit field. Tremor must not lose work.
- **Essentials mode** — a simplified view: today's pending approvals, big approve/reject buttons, no search bar, no settings. Toggle in user prefs.
- **Screen reader** support audited per release with NVDA + VoiceOver.
- **Axe-core** runs in Playwright e2e suite; CI fails on serious/critical violations.

Spec lives in [docs/accessibility.md](docs/accessibility.md) (to be written).

## Deployment

**v1 target:** single-Mac deployment (the founding family's case). All three services — imsg-agent, contacts-mcp, commshub99 — run on dad's Mac. Family members reach the web UI via Tailscale.

**Forward path:**
- Linux server deployment: imsg-agent must still run on a Mac (iMessage requirement) but can sync its SQLite + Markdown to the server via Syncthing or rsync. commshub99 runs on the server.
- Per-user multi-Mac: each Mac runs imsg-agent; they all sync upward to a central commshub99. The `tenants` and `channel_configs` tables already accommodate this.
- Hosted offering: same architecture, plus PostgreSQL migration. Out of scope for the planning horizon.

Deployment guide will live in [docs/deployment.md](docs/deployment.md). Initial form: a `docker compose` file plus a Homebrew formula for the Mac case.

## Security posture

- The web app and MCP server bind to localhost by default; exposing them is the operator's choice (Tailscale, reverse proxy with TLS, etc.).
- Secrets (channel credentials, API tokens) live in `channel_configs.config_json`, encrypted at rest using a per-instance key stored in the OS keychain (macOS Keychain, libsecret on Linux).
- Read of imsg-agent's SQLite is opened with `mode: 'readonly', fileMustExist: true`. We never write.
- Drafts are written via atomic rename (`fs.rename` from a temp file in the same directory) to defend against partial writes during a crash.
- AGPL-3.0 means anyone running this network-accessible must offer source. The README and web footer link to the source repo.
- No telemetry. No external calls except those the operator configures (channel APIs, contacts-mcp providers).

## Open questions deferred to first PRs

These don't block v0.1 scaffolding but want resolution by v0.2:

1. **Attachments** — display, edit, attach to drafts. imsg-agent already archives attachment blobs; we need a content-type-aware viewer and a drag-drop attach flow.
2. **Cross-chat patterns** — should "this person across all channels" be a first-class view? Risks cross-context leakage; defer until adapter contract is firm.
3. **Provider sync UX for contacts** — contacts-mcp has full CRUD + sync; do we surface that here, or send users to a separate contacts UI?
4. **Multi-Mac topology** — when a second family member adds their Mac, how does the hub learn about that imsg-agent instance? File path config per tenant? Discovery protocol?
5. **Reaction sending** — iMessage tapbacks; not all channels support them. Capability flag in adapter, but UX needs work.

When in doubt, prefer the smaller scope. We can add; we cannot easily un-add.
