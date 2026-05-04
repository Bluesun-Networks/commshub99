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

## Milestone v0.1 — Foundations & Read-Only Browse

### Repository scaffolding

- [x] **Initialize pnpm workspace and Turborepo.** Files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`. Acceptance: `pnpm install` runs clean, `pnpm turbo run build` is a no-op without errors. **(haiku)**
- [x] **Add Biome config.** Files: `biome.json`. Lint + format. Acceptance: `pnpm biome check .` passes on the empty repo. **(haiku)**
- [x] **Add TypeScript base config.** Files: `tsconfig.base.json`, per-package `tsconfig.json` extends. Strict mode on, `verbatimModuleSyntax: true`. Acceptance: `tsc --noEmit` clean. **(haiku)**
- [x] **Add Vitest workspace config.** Files: `vitest.config.ts`. Acceptance: `pnpm test` runs and reports 0 tests. **(haiku)**
- [x] **Add GitHub Actions CI matrix.** Files: `.github/workflows/ci.yml`. Matrix over `ubuntu-latest` (amd64), `ubuntu-24.04-arm` (arm64), `macos-14` (Apple Silicon). Steps: install pnpm, cache, lint, typecheck, test, build. Acceptance: green CI on a no-op PR. **(sonnet)**
- [x] **Add CONTRIBUTING.md and CODE_OF_CONDUCT.md.** Cover AGPL implications, no-CLA stance, accessibility expectations. **(haiku)**
- [x] **Add LICENSE headers script.** Tool that checks/adds SPDX header. Files: `tools/scripts/license-headers.ts`. `pnpm check:licenses` in CI lint job. **(haiku)**

### Database layer (`packages/db`)

- [ ] **Bootstrap Drizzle for SQLite.** Files: `packages/db/package.json`, `packages/db/drizzle.config.ts`, `packages/db/src/client.ts`. Acceptance: opening the client creates an empty SQLite file at the configured path. **(sonnet)**
- [ ] **Define `users`, `sessions`, `tenants`, `tenant_users` schemas.** Files: `packages/db/src/schema/auth.ts`. Match the column list in [PLAN.md § Hub's own database](PLAN.md#hubs-own-database). Acceptance: migration generates and applies cleanly. **(sonnet)**
- [ ] **Define `audit_log` schema.** Files: `packages/db/src/schema/audit.ts`. Append-only; include `tenant_id`, `user_id`, `action`, `target_type`, `target_id`, `payload_json`, `created_at`. **(sonnet)**
- [ ] **Migration runner with seed for first admin.** Files: `packages/db/src/migrate.ts`, CLI entry `pnpm db:migrate`, `pnpm db:seed`. Seed reads `INITIAL_ADMIN_EMAIL` env var. Acceptance: fresh install ends with one admin user. **(sonnet)**

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
