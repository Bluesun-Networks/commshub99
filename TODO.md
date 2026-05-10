# commshub99 — TODO

Actionable, ordered, tagged with a suggested model. Pick the next unchecked item, do it, open a PR, check it off.

## How to use this list

- Items marked `[ ]` are open. Mark `[x]` when merged to `main`.
- **Model tag** at the end of each item — `(haiku)`, `(sonnet)`, `(opus)` — is a suggestion, not a rule. Override when the actual scope demands it.
- **Files** lists the primary paths the task touches; cross-cutting work names the package.
- **Depends on** lists prior items that must be done first. If empty, the task is unblocked.
- **Acceptance** is the test the PR must pass to merge.

### Model selection rubric

| Use                   | When                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Haiku 4.5**         | Scaffolding, config files, package.json, dotfiles, doc updates, simple test stubs, formatting, generated CRUD UI from a clear spec. Cheap and fast for low-judgment work. |
| **Sonnet 4.6**        | Most implementation: UI components, API routes, adapter implementations, integration tests, refactors inside one or two files, straightforward bug fixes. Default choice. |
| **Opus 4.7**          | Architecture decisions, multi-package refactors, security-sensitive code (auth, MCP tool definitions, draft state machine, file-system writes that touch user data), performance work, gnarly debugging, channel adapter contract design, accessibility audits requiring judgment. |

If a task could plausibly use either, pick the cheaper. Escalate only when the cheaper model produces a wrong answer or churns. Never use Opus for boilerplate; never use Haiku for design.

## Conventions for new tasks

When you complete a task and discover follow-ups, append them under the relevant milestone with the same shape. When a task grows, split it into 2–3 smaller items rather than letting one item balloon.

---

## Current Core Completion Backlog

This section reflects the current codebase state after the first local web/admin flows landed. Older milestone sections below remain useful, but some unchecked items are stale because the implementation exists in a different layer than originally planned.

### Security and auth

- [x] **Add a central permission matrix.** Files: `packages/auth/src/permissions.ts`, `packages/auth/src/permissions.test.ts`, `packages/auth/src/index.ts`. Define permissions for browse, approve, reject, schedule, edit drafts, manage users, manage settings, and view audit log. Acceptance: tests cover `admin` and `readonly`. **(opus)**
- [x] **Add server-side permission guards.** Files: `packages/auth/src/guards.ts`, `apps/web/src/app/api/_auth.ts`. Expose a stable denied response/code and helpers for route handlers. Acceptance: route tests or focused unit tests prove unauthorized requests fail closed. **(sonnet)**
- [x] **Protect mutating web routes.** Files: `apps/web/src/app/api/**/route.ts`. Apply permissions to existing approve, reject, draft-edit, and contact-update routes. Acceptance: readonly sessions cannot approve/reject via direct HTTP calls. **(opus)**
- [x] **Reconcile auth docs and implementation.** Files: `TODO.md`, `README.md`, `PLAN.md`, `ROADMAP.md`. Decide whether custom local auth remains the v0 path or better-auth is still required. Acceptance: docs stop describing already-shipped auth as future work. **(sonnet)**
- [ ] **Add invite/multi-user onboarding.** Files: `packages/auth`, `packages/db`, `apps/web`. Admin can invite a user, set role, revoke/disable, and reset credentials. Acceptance: invited readonly users can sign in but cannot mutate. **(opus)**

### Core domain and adapter architecture

- [x] **Move domain types into `packages/core`.** Files: `packages/core/src/types.ts`, `packages/core/src/index.ts`. Centralize conversation, message, participant, attachment, proposed-message, and channel IDs. Acceptance: web and adapters import shared types instead of redefining them. **(opus)**
- [x] **Implement adapter registry and service layer.** Files: `packages/core/src/registry.ts`, `packages/core/src/services/*.ts`. Add `ConversationService`, `MessageService`, and `DraftService` over registered adapters. Acceptance: duplicate adapter IDs throw and service tests cover routing by channel/id. **(opus)**
- [x] **Move iMessage read logic out of web routes.** Files: `packages/adapters/imessage/src/*.ts`, `apps/web/src/app/api/imessage/**`. Conversations, messages, contacts, and drafts should be served through adapter/core APIs. Acceptance: web routes become thin auth/serialization wrappers. **(opus)**
- [x] **Move iMessage approve/reject logic out of web routes.** Files: `packages/adapters/imessage/src/approve.ts`, `packages/adapters/imessage/src/reject.ts`, `packages/core/src/services/draft.ts`. Preserve atomic writes and service normalization. Acceptance: unit/integration tests cover approve, reject, idempotent retry, and malformed draft handling. **(opus)**
- [x] **Add fixture-backed iMessage adapter tests.** Files: `packages/adapters/imessage/test/fixtures`, `packages/adapters/imessage/src/*.test.ts`. Use a tiny SQLite fixture and temp data directory. Acceptance: tests do not touch `~/imsg-data`. **(sonnet)**

### Approval workflow

- [x] **Add edit-before-approve.** Files: `apps/web/src/components/AppShell.tsx` or `DraftReview.tsx`, draft approve API/service. User can edit body before approval; edits are what reach outbox. Acceptance: edited text appears in the generated outbox item. **(opus)**
- [x] **Add tremor-safe confirmation.** Files: `apps/web/src/components/DraftReview.tsx`, `apps/web/src/app/globals.css`. Use a hold-to-confirm or equivalent accessible interaction for approve/reject. Acceptance: accidental single click cannot send. **(opus)**
- [x] **Write audit log entries for all draft mutations.** Files: `packages/core/src/services/audit.ts`, draft service/routes. Capture user, action, target, and payload for approve, reject, edit, schedule, cancel. Acceptance: approving a draft creates an audit row with the current user ID. **(sonnet)**
- [x] **Add live approval updates.** Files: `apps/web/src/app/api/events/route.ts`, `apps/web/src/components/AppShell.tsx`. Push draft changes via SSE or a similarly simple local mechanism. Acceptance: queue updates without manual refresh after imsg-agent writes/moves files. **(sonnet)**
- [ ] **Add approval end-to-end coverage.** Files: `apps/web/e2e` or focused integration tests. Seed a temp draft, approve it, and verify the outbox artifact. Acceptance: test is deterministic and never sends a real iMessage. **(sonnet)**

### Scheduling

- [x] **Add scheduled sends schema and migration.** Files: `packages/db/src/schema/schedule.ts`, migrations. Include tenant, draft ref, send time, status, attempts, last error, requester, timestamps. Acceptance: migration applies on a fresh DB. **(sonnet)**
- [x] **Implement schedule service and worker.** Files: `packages/core/src/workers/schedule.ts`, `packages/core/src/services/schedule.ts`. Poll due sends, run approve flow, retry with backoff, and mark terminal failures. Acceptance: tests cover due, future, retry, cancel, and failed states. **(opus)**
- [x] **Add schedule UI.** Files: `apps/web/src/components/Schedule*.tsx`, approvals view. User can schedule, view, cancel, and reschedule sends with correct local timezone display. Acceptance: scheduled drafts are not sent until due. **(sonnet)**

### Contacts and identity

- [x] **Harden contacts MCP client.** Files: `packages/mcp-client/src/client.ts`, `packages/mcp-client/src/contacts.ts`. Add reconnect, timeout, structured errors, and 10 minute in-memory cache. Acceptance: contacts failure degrades gracefully in conversations/approvals. **(sonnet)**
- [ ] **Complete contact linking/correction.** Files: `apps/web`, `packages/core`, iMessage adapter. User can correct a handle-to-contact match and see it persist. Acceptance: corrected match affects conversation and approval display names. **(sonnet)**

### Context and personalization

- [x] **Design contact and conversation context model.** Files: `packages/db/src/schema/context.ts`, `packages/core/src/types.ts`, `docs/data-model.md`. Add separate records for contact context and conversation/group context. Include free-form notes plus structured choices for relationship/category (`family`, `friend`, `professional`, `service`, `unknown`), tone (`polite`, `warm`, `direct`, `terse`, `avoid_rude`), reply posture (`do_not_reply`, `reply_if_needed`, `usually_reply`, `always_reply`), and sharing boundaries such as allowed personal details (`location`, `health_updates`, `daily_agenda`, `family_updates`, custom). Acceptance: schema and types can represent participant-specific context and room/group-level context without making every thread its own context silo. **(opus)**
- [x] **Add audited context version history.** Files: `packages/db/src/schema/context.ts`, `packages/core/src/services/context.ts`, `packages/core/src/services/audit.ts`. Every context create/update/delete stores actor, timestamp, before/after payload, source (`human`, `harvest`, `import`, `system`), confidence, and review status. Acceptance: admins can inspect who/what changed a contact or conversation context entry and roll back or supersede it. **(opus)**
- [x] **Implement context service and resolution layering.** Files: `packages/core/src/services/context.ts`, `packages/core/src/services/draft.ts`, iMessage adapter integration. Given a conversation/group, resolve context in order: each participant/contact context, then conversation/group/room context, then global defaults. Handle conflicts conservatively, with `do_not_reply` and privacy boundaries taking precedence. Acceptance: a draft request can receive a deterministic context bundle showing which contact and conversation records contributed. **(opus)**
- [x] **Add historical chat context harvest/extract/enrich job.** Files: `packages/core/src/services/context-harvest.ts`, `packages/adapters/imessage/src/*.ts`, `apps/cli/src/index.ts`. Analyze historical chats to suggest contact and conversation context: relationship hints, tone preferences, cadence, reply posture, recurring topics, and safe personal-detail boundaries. Suggestions must be reviewable and never silently applied. Acceptance: running the job against fixture chats produces proposed context entries with confidence and evidence snippets/row IDs. **(opus)**
- [x] **Add context review and edit UI.** Files: `apps/web/src/components/AppShell.tsx` or split `Context*.tsx`, `apps/web/src/app/api/context/**`. Admins can edit free-form prompt/notes and structured choices for a contact and for a group/conversation room. Harvested suggestions appear as approve/reject/edit cards. Acceptance: admin can set “do not reply” for a contact, add a room note for a group chat, and see both reflected in the context preview. **(sonnet)**
- [ ] **Pass resolved context to draft generation surfaces.** Files: imsg-agent handoff docs/integration, `packages/core/src/services/context.ts`, `apps/cli/src/index.ts`, docs. Export or expose context bundles so upstream generation can follow “do not reply,” “always reply,” tone, relationship, and sharing-boundary rules. Acceptance: generated draft metadata includes the context version IDs used, and approval UI shows the active context that shaped the draft. **(opus)**
- [ ] **Add context-aware approval safeguards.** Files: `packages/core/src/services/draft.ts`, `apps/web/src/components/AppShell.tsx`, `apps/cli/src/index.ts`. Block or strongly warn when approving drafts that violate `do_not_reply`, privacy boundaries, or conversation-level constraints. Acceptance: a draft for a `do_not_reply` contact cannot be approved without an explicit admin override that is audited. **(opus)**

### CLI, MCP, and automation surfaces

- [x] **Build operator CLI workflows.** Files: `apps/cli/src/index.ts` or Ink/commander split. Add pending, approve, reject, schedule, and tail. Acceptance: CLI can approve a temp draft without web UI. **(sonnet)**
- [ ] **Implement MCP server tools.** Files: `apps/mcp/src/index.ts`, `packages/core`. Add list pending, get proposed, approve, reject, schedule, cancel, search, and audit tools. Acceptance: tools enforce same permissions as web. **(opus)**
- [ ] **Add API tokens.** Files: `packages/db`, `packages/auth`, `apps/mcp`, `apps/cli`. Tokens are hashed at rest, scoped to users, revocable, and audited. Acceptance: MCP/CLI token auth cannot bypass role restrictions. **(opus)**

### Deployment, operations, and docs

- [x] **Write single-Mac deployment docs.** Files: `docs/deployment.md`, `README.md`. Include prerequisites, env, DB migration, local admin bootstrap/reset, launchd services, troubleshooting, and remote dev origins. Acceptance: fresh machine setup can follow docs without tribal knowledge. **(sonnet)**
- [x] **Polish status/ops output.** Files: `apps/cli/src/index.ts`. Separate historical archived errors from new failures; show last sent time and queue trend. Acceptance: `admin status` no longer reads like an error when only old archived errors exist. **(haiku)**
- [x] **Refresh public project docs.** Files: `README.md`, `PLAN.md`, `ROADMAP.md`, `TODO.md`. Replace stale "pre-implementation" and update milestone state. Acceptance: docs match what the app can currently do. **(sonnet)**
- [x] **Add release smoke checklist.** Files: `docs/deployment.md` or `docs/release-smoke.md`. Include local web login, approvals, status, imsg-agent services, and remote server checks. Acceptance: checklist catches the recent module/dev-origin/send-service issues. **(haiku)**

## Milestone v0.1 — Foundations & Read-Only Browse

### Repository scaffolding

- [x] **Initialize Bun workspace and Turborepo.** Files: `package.json`, `bun.lock`, `turbo.json`, `.nvmrc`, `.gitignore`. Acceptance: `bun install` runs clean, `bun run build` executes workspace tasks without errors. **(haiku)**
- [x] **Add Biome config.** Files: `biome.json`. Lint + format. Acceptance: `bun run lint` passes on the empty repo. **(haiku)**
- [x] **Add TypeScript base config.** Files: `tsconfig.base.json`, per-package `tsconfig.json` extends. Strict mode on, `verbatimModuleSyntax: true`. Acceptance: `tsc --noEmit` clean. **(haiku)**
- [x] **Add Vitest workspace config.** Files: `vitest.config.ts`. Acceptance: `bun test` runs and reports 0 tests. **(haiku)**
- [x] **Add GitHub Actions CI matrix.** Files: `.github/workflows/ci.yml`. Matrix over `ubuntu-latest` (amd64), `ubuntu-24.04-arm` (arm64), `macos-14` (Apple Silicon). Steps: install Bun, lint, typecheck, test, build. Acceptance: green CI on a no-op PR. **(sonnet)**
- [x] **Add CONTRIBUTING.md and CODE_OF_CONDUCT.md.** Cover AGPL implications, no-CLA stance, accessibility expectations. **(haiku)**
- [x] **Add LICENSE headers script.** Tool that checks/adds SPDX header. Files: `tools/scripts/license-headers.ts`. `bun run check:licenses` in CI lint job. **(haiku)**

### Database layer (`packages/db`)

- [x] **Bootstrap Drizzle for SQLite.** Files: `packages/db/package.json`, `packages/db/drizzle.config.ts`, `packages/db/src/client.ts`. Acceptance: opening the client creates an empty SQLite file at the configured path. **(sonnet)**
- [x] **Define `users`, `sessions`, `tenants`, `tenant_users` schemas.** Files: `packages/db/src/schema/auth.ts`. Match the column list in [PLAN.md § Hub's own database](PLAN.md#hubs-own-database). Acceptance: migration generates and applies cleanly. **(sonnet)**
- [x] **Define `audit_log` schema.** Files: `packages/db/src/schema/audit.ts`. Append-only; include `tenant_id`, `user_id`, `action`, `target_type`, `target_id`, `payload_json`, `created_at`. **(sonnet)**
- [x] **Migration runner with seed for first admin.** Files: `packages/db/src/migrate.ts`, CLI entry `bun run db:migrate`, `bun run db:seed`. Seed reads `INITIAL_ADMIN_EMAIL` env var. Acceptance: fresh install ends with one admin user. **(sonnet)**

### Auth layer (`packages/auth`)

- [ ] **Set up better-auth with email+password.** Files: `packages/auth/src/config.ts`. Use the Drizzle adapter pointing at `packages/db`. Sessions stored in DB. **(opus)** — security-sensitive setup; do not delegate to Haiku.
- [ ] **Define `Permission` enum and `can(user, action, target)` pure function.** Files: `packages/auth/src/permissions.ts`. Two roles: `admin`, `readonly`. Acceptance: unit tests cover the matrix of role × action. **(opus)**
- [ ] **Server-side helper `requirePermission(req, permission)` for Next.js routes.** Throws on failure with a stable error code. Files: `packages/auth/src/guards.ts`. **(sonnet)**

### Core domain (`packages/core`)

- [ ] **Define channel-agnostic types** (`Conversation`, `Message`, `ProposedMessage`, `Participant`, `Attachment`, `ChannelId`). Files: `packages/core/src/types.ts`. Match [PLAN.md § Domain model](PLAN.md#domain-model-packagescore). Zod schemas alongside TypeScript types so they double as runtime validators. **(opus)** — these types are load-bearing.
- [ ] **`ChannelAdapter` interface and capability flags.** Files: `packages/adapters/_contract/src/index.ts`. See [docs/channel-adapters.md](docs/channel-adapters.md). **(opus)** — contract design.
- [ ] **`AdapterRegistry`.** Files: `packages/core/src/registry.ts`. Adapters register themselves at startup; services look them up by `ChannelId`. Acceptance: registering twice with the same ID throws. **(sonnet)**
- [ ] **`ConversationService.list(tenantId)`** that asks every registered adapter and merges results, sorted by `lastMessageAt`. Files: `packages/core/src/services/conversation.ts`. **(sonnet)**
- [ ] **`MessageService.list(conversationId, opts)`.** Routes to the owning adapter by ID prefix. **(sonnet)**

### contacts-mcp client (`packages/mcp-client`)

- [ ] **MCP stdio client wrapping `@modelcontextprotocol/sdk`.** Spawns contacts-mcp as a child process; reconnects on crash. Files: `packages/mcp-client/src/client.ts`. **(sonnet)**
- [ ] **`resolveContactPoints(handles)` helper** that calls contacts-mcp's `resolve_contact_points` tool, with an in-memory LRU cache (10 min TTL). Files: `packages/mcp-client/src/contacts.ts`. **(sonnet)**

### iMessage adapter v0 (read-only)

- [ ] **Open imsg-agent SQLite read-only.** Files: `packages/adapters/imessage/src/db.ts`. Open with `{ readonly: true, fileMustExist: true }`. Path from config (`IMSG_DATA_DIR` env or per-tenant config). **(opus)** — touches user data; must not write.
- [ ] **`listConversations()` impl.** Query `chats` joined with `chat_contact_matches`, sort by `last_message_at` desc, limit configurable. Map to `Conversation`. Resolve display names via `mcp-client`. Files: `packages/adapters/imessage/src/conversations.ts`. **(sonnet)**
- [ ] **`listMessages(conversationId, opts)` impl.** Query `messages` for the chat, fetch attachment metadata, return `Message[]`. Files: `packages/adapters/imessage/src/messages.ts`. **(sonnet)**
- [ ] **Adapter integration tests against a fixture SQLite.** Snapshot-style; ship a tiny seeded DB in `packages/adapters/imessage/test/fixtures/`. Files: `packages/adapters/imessage/test/`. **(sonnet)**
- [ ] **Register iMessage adapter at app startup.** Files: `apps/web/src/server/bootstrap.ts`. Registration is conditional on env / config. **(sonnet)**

### Web app (`apps/web`)

- [ ] **Bootstrap Next.js 15 (App Router) with Tailwind and shadcn/ui.** Files: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tailwind.config.ts`, `apps/web/src/app/layout.tsx`. **(sonnet)**
- [ ] **Sign-in / sign-out pages** wired to better-auth. Files: `apps/web/src/app/(auth)/`. Tremor-safe form (auto-save email field, big submit). **(sonnet)**
- [ ] **App shell with Essentials/Power toggle.** Files: `apps/web/src/components/AppShell.tsx`. Toggle persisted in user prefs. **(sonnet)**
- [ ] **Conversations list page** at `/conversations`. Server component fetches via `ConversationService`. **(sonnet)**
- [ ] **Conversation detail page** at `/conversations/[id]`. Renders messages, scrolls to bottom on load, accessible chat bubbles. **(sonnet)**
- [ ] **Accessibility tokens.** Files: `packages/ui/src/tokens.css`. Define touch-target, focus-ring, font-scale variables; wire into Tailwind. **(opus)** — sets the design baseline.
- [ ] **Playwright + axe-core e2e suite.** Files: `apps/web/e2e/`. Tests: sign-in, browse conversations, open one. CI fails on serious/critical violations. **(sonnet)**
- [ ] **Lighthouse CI on PRs** with a 95 a11y floor. Files: `.github/workflows/lighthouse.yml`. **(haiku)**

### Founding-family deploy (manual)

- [ ] **Write `docs/deployment.md` with single-Mac install steps.** Homebrew prerequisites, env file, first-admin seed, launchd plist for autostart. **(sonnet)**
- [ ] **Manual smoke test on dad's Mac.** Sign in, see today's conversations, open one. Document any rough edges in TODO follow-ups. **(sonnet)**

**v0.1 done when:** all unchecked v0.1 items above are checked, `v0.1.0` tag pushed, demo recording linked from README.

---

## Milestone v0.2 — Approve / Reject Workflow

- [ ] **`DraftService` state machine.** States in [PLAN.md § Domain model](PLAN.md#domain-model-packagescore). Files: `packages/core/src/services/draft.ts`. **(opus)** — state machine touches user data; correctness matters.
- [ ] **iMessage adapter `listProposedMessages()`.** Watch `~/imsg-data/drafts/` with chokidar; parse Markdown frontmatter (`gray-matter`); emit on changes. Files: `packages/adapters/imessage/src/drafts.ts`. **(sonnet)**
- [ ] **iMessage adapter `approveMessage(id, edits?)`.** Rewrite body if edited, set `approved: true`, atomic-rename to `~/imsg-data/outbox/`. Files: `packages/adapters/imessage/src/approve.ts`. **(opus)** — file-system writes; must be atomic.
- [ ] **iMessage adapter `rejectMessage(id, reason?)`.** Move to `~/imsg-data/rejected/<uuid>.md` with reason in frontmatter. Files: `packages/adapters/imessage/src/reject.ts`. **(sonnet)**
- [ ] **SSE endpoint `/api/events`.** Pushes draft state changes per-user. Files: `apps/web/src/app/api/events/route.ts`. **(sonnet)**
- [ ] **Pending approvals queue page** at `/approvals`. Live updates via SSE. Files: `apps/web/src/app/(app)/approvals/page.tsx`. **(sonnet)**
- [ ] **Draft detail + approve/reject UI** with tremor-safe confirmation (1.5s hold or slide-to-confirm). Files: `apps/web/src/components/DraftReview.tsx`. **(opus)** — accessibility-critical interaction.
- [ ] **Audit log writer.** Files: `packages/core/src/services/audit.ts`. Called from every mutating service. **(sonnet)**
- [ ] **Essentials home = approvals queue.** Files: `apps/web/src/app/(app)/page.tsx`. **(sonnet)**
- [ ] **End-to-end test:** seed a draft, approve it, verify file moved to outbox. **(sonnet)**

---

## Milestone v0.3 — Scheduling

- [ ] **`scheduled_sends` table + migration.** Files: `packages/db/src/schema/schedule.ts`. **(sonnet)**
- [ ] **Schedule worker.** Polls every 30s; runs the approve flow when due; backoff on failure. Files: `packages/core/src/workers/schedule.ts`. Started from `apps/web/src/server/bootstrap.ts`. **(opus)** — concurrency + retry semantics.
- [ ] **Schedule UI: date/time picker, list, cancel/reschedule.** Files: `apps/web/src/components/Schedule*.tsx`. Handle TZ display correctly. **(sonnet)**
- [ ] **Tests for backoff and retry.** **(sonnet)**

---

## Milestone v0.4 — Read-only role + multi-user

- [ ] **Invite flow** (signed token email link, SMTP config in `channel_configs`). **(opus)** — token signing, expiration, single-use.
- [ ] **Permission middleware on all mutating routes.** Files: `apps/web/src/middleware.ts`. **(opus)**
- [ ] **Read-only UI affordances** (disabled buttons with tooltip, hidden config). **(sonnet)**
- [ ] **Suggested-edits feature**: read-only users attach a suggestion to a draft; admin sees it in detail view. **(sonnet)**

---

## Milestone v0.5 — TUI / CLI (`apps/cli`)

- [ ] **Bootstrap Ink + commander.** **(sonnet)**
- [ ] **`auth login` flow with API token.** **(sonnet)**
- [ ] **`pending`, `approve`, `reject`, `schedule`, `tail` commands.** **(sonnet)**
- [ ] **API tokens table in DB.** Hashed at rest. **(opus)** — token security.

---

## Milestone v0.6 — MCP Server (`apps/mcp`)

- [ ] **Bootstrap MCP server with `@modelcontextprotocol/sdk`.** **(sonnet)**
- [ ] **Tool definitions matching [PLAN.md § MCP server](PLAN.md#mcp-server-appsmcp).** Each tool's input schema is a Zod schema reused from `packages/core`. **(opus)** — surface area exposed to other agents; needs care.
- [ ] **Auth via API token; permissions enforced per call.** **(opus)**
- [ ] **MCP-originated audit-log entries tagged with `client_id`.** **(sonnet)**
- [ ] **Example client config in `docs/`.** **(haiku)**

---

## Milestone v1.0 — Discord adapter

- [ ] **`packages/adapters/discord` skeleton implementing `ChannelAdapter`.** **(opus)** — first non-iMessage adapter validates the contract.
- [ ] **OAuth2 setup for Discord; token storage encrypted.** **(opus)**
- [ ] **Conversation listing (DMs + selected channels).** **(sonnet)**
- [ ] **Send + scheduled send.** **(sonnet)**
- [ ] **Channel switcher in web UI.** **(sonnet)**
- [ ] **Update `docs/channel-adapters.md` with lessons learned.** **(sonnet)**

---

## Cross-cutting / always-open

- [ ] **Keep `docs/data-model.md` current** as schemas evolve. **(sonnet)**
- [ ] **Keep `docs/accessibility.md` current** with audit results per release. **(sonnet)**
- [ ] **Bump `CHANGELOG.md` per merged PR** following Keep-a-Changelog. **(haiku)**
- [ ] **Security review before any release that exposes a new surface** (web, MCP, CLI). **(opus)** — use the `/security-review` skill.

---

## Triaging incoming work

If a user reports a bug or proposes a feature:

1. If it fits the next milestone, append to that milestone.
2. If it's out of scope, open a GitHub issue with the `triage` label and link from the relevant section here.
3. If it's a security issue, do not file publicly; follow `SECURITY.md` (to be written; sonnet).
