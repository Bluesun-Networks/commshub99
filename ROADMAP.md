# commshub99 — Roadmap

Milestones are defined by *what a user can do*, not by *what code exists*. Each milestone ends with a tagged release (`v0.1.0`, etc.), a demo recording, and an updated [TODO.md](TODO.md).

> **Cadence target:** 2–4 weeks per minor milestone for the first six. Reality will differ.

## v0.1 — Foundations & Read-Only Browse

**User can:** sign in to the web UI as admin, see the list of recent iMessage conversations enriched with contact names, open a conversation and read its message history.

**Engineering scope:**
- Monorepo bootstrap: pnpm workspaces, Turborepo, Biome, Vitest, Playwright, GitHub Actions matrix (linux-amd64, linux-arm64, macos-arm64).
- `apps/web` Next.js skeleton with Tailwind + shadcn/ui, Essentials/Power layout shell.
- `packages/db` Drizzle schema for `users`, `sessions`, `tenants`, `tenant_users`, `audit_log`. Migration runner.
- `packages/auth` better-auth integration. Email+password, admin role only. Sign-in, sign-out, password reset.
- `packages/core` ConversationService, MessageService (read-only).
- `packages/adapters/_contract` initial `ChannelAdapter` interface.
- `packages/adapters/imessage` v0: read `chats`, `messages`, `chat_contact_matches` from `~/imsg-data/imessage.sqlite`. No drafts yet.
- `packages/mcp-client` wrapper for contacts-mcp; resolves contact names per conversation.
- Accessibility baseline: 48px touch targets, font scaling, focus rings, axe-core in Playwright.
- README with one-command local dev (`pnpm dev`).

**Exit criteria:** Manual deploy to founding family's Mac. Dad signs in, sees today's conversations, taps one, reads it. Lighthouse a11y ≥ 95. Axe-core: zero serious/critical violations.

## v0.2 — Approve / Reject Workflow

**User can:** see a queue of drafts proposed by imsg-agent, read each draft and its reasoning, edit the body, approve (which sends), or reject (which deletes).

**Engineering scope:**
- iMessage adapter: watch `~/imsg-data/drafts/`, parse Markdown frontmatter into `ProposedMessage`.
- DraftService in `packages/core` with the approve/reject state machine.
- File-system writes via atomic rename: edit body, set frontmatter `approved: true`, move to `~/imsg-data/outbox/`.
- SSE endpoint pushing draft state changes.
- Web UI: pending-approvals queue, draft detail page, edit-and-approve flow with tremor-safe confirmation (1.5s hold or slide-to-confirm).
- Audit log entries for every approve/reject/edit.
- Essentials mode: stripped-down approval queue as the home page.

**Exit criteria:** Dad approves a real draft from imsg-agent on his own. Audit log shows the action with his user ID.

## v0.3 — Scheduling

**User can:** schedule an approved draft to send at a future time. View, reschedule, or cancel pending scheduled sends.

**Engineering scope:**
- `scheduled_sends` table + Drizzle migration.
- Worker process inside the web app (single-process deploy) or `apps/mcp` (split deploy) polling every 30s.
- Schedule UI: date/time picker, list of pending schedules, cancel/reschedule actions.
- Failure handling: exponential backoff up to 5 attempts, surface error in UI with retry.
- Timezone handling: store UTC, display in user's TZ.

**Exit criteria:** Schedule a message for 5 minutes from now, watch it land. Schedule another, cancel before it fires.

## v0.4 — Read-only role + multi-user

**User can:** an admin invites family members. Invited users sign in. Read-only users see conversations and drafts but cannot approve, reject, schedule, or edit.

**Engineering scope:**
- Invite flow (email link with signed token; SMTP config in `channel_configs`).
- Permission middleware on every mutating route.
- UI affordances: read-only users see disabled buttons with tooltip explanations.
- "Suggested edits" feature: read-only users can leave a suggestion attached to a draft; admin sees it on the draft detail page.

**Exit criteria:** Sibling signs in, browses drafts, leaves a suggested edit. Dad sees the suggestion when he opens the draft.

## v0.5 — TUI / CLI

**User can:** run `commshub99` in a terminal, sign in, see pending approvals, approve from the keyboard.

**Engineering scope:**
- `apps/cli` with Ink. Commands: `auth login`, `pending`, `approve <id>`, `reject <id>`, `schedule <id> <when>`, `tail` (live SSE feed).
- Auth via API token, not browser session.
- Reuses `packages/core` services; no duplicate logic.

**Exit criteria:** Approve a draft from a tmux pane on a remote SSH session.

## v0.6 — MCP Server

**User can:** point commsbot99 (or any MCP client) at the hub and let it list/approve/schedule on behalf of an authorized user.

**Engineering scope:**
- `apps/mcp` MCP server exposing the tools listed in [PLAN.md](PLAN.md#mcp-server-appsmcp).
- API tokens scoped to a user, with their permissions.
- Audit log captures the MCP client identity per call.
- Documentation with example MCP client config.

**Exit criteria:** Drive the hub end-to-end via MCP from the Claude Desktop app. Audit log shows MCP-originated actions tagged distinctly from web-originated ones.

## v1.0 — Discord Adapter (proof of pluggability)

**User can:** connect a Discord account, see DMs and selected channels alongside iMessage conversations, approve drafts addressed to Discord.

**Engineering scope:**
- `packages/adapters/discord`: Discord bot/user-token auth, conversation listing, message fetch, send.
- Capability flags in adapter contract: not all channels support reactions, scheduled send, read receipts.
- Channel switcher in web UI.
- imsg-agent does not generate Discord drafts; commsbot99 (or another upstream agent) does. The hub treats them identically once they reach `ProposedMessage` shape.

**Exit criteria:** Approve a draft addressed to a Discord DM and watch it appear in Discord. Author of a third-party adapter has a clear path documented in [docs/channel-adapters.md](docs/channel-adapters.md).

## v1.x — Additional channels

**Order:** Email → WhatsApp → SMS → Slack → Signal.

Each channel ships as a minor release (`v1.1`, `v1.2`, …). Order may shift based on user demand and API availability (Signal is hard; SMS may need Twilio).

## v2.0 — Hosted-ready

Out of detailed planning until v1.0 ships. Likely scope:
- PostgreSQL backend option.
- Multi-tenancy hardening: per-tenant rate limits, isolated worker pools.
- Structured logging + OpenTelemetry traces.
- Encrypted backups.
- A managed-instance offering for families that don't want to self-host.

## What is explicitly *not* on the roadmap

- Inference inside the hub (always upstream).
- Native iOS/Android apps (responsive web is the v1 mobile story).
- E2E encryption between hub instances.
- A marketplace for paid channel adapters. (Adapters are AGPL like everything else.)
- Replacing imsg-agent or contacts-mcp. The hub composes them; it does not subsume them.

## Revising the roadmap

Open a PR that edits this file. Roadmap changes are first-class commits. The corresponding [TODO.md](TODO.md) gets updated in the same PR.
