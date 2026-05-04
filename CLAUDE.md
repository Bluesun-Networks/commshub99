# CLAUDE.md — Agent guide for commshub99

This file is loaded automatically by Claude Code (and any agent that respects `CLAUDE.md`) when working in this repository. It is the single source of truth for *how AI coders should behave here*. Read it fully before your first edit.

If you only have time for one paragraph: **commshub99 is the open-source, AGPL-3.0 web UI (plus CLI and MCP server) that lets humans review, approve, reject, and schedule communications across many channels — starting with iMessage. It is not an AI. It does not call LLMs. It is the seam between humans and upstream agents like imsg-agent and (future) commsbot99. The first user has Parkinson's; accessibility is a hard requirement, not a checklist.**

## Read these in order before significant work

1. [VISION.md](VISION.md) — the principles that constrain every decision.
2. [PLAN.md](PLAN.md) — the architecture.
3. [ROADMAP.md](ROADMAP.md) — what we're building when.
4. [TODO.md](TODO.md) — the next actionable task.
5. [docs/channel-adapters.md](docs/channel-adapters.md) — the contract that defines pluggability.

For deep context on the upstream projects:
- `~/src/imsg-agent/` (Python) — owns iMessage archive at `~/imsg-data/imessage.sqlite` and Markdown drafts at `~/imsg-data/{drafts,outbox,sent,errors}/`. We **read its SQLite directly (read-only)** and **manage its Markdown files** to drive the approval workflow. Read its `README.md`, `PLAN.md`, and `ROADMAP.md` before touching the iMessage adapter.
- `~/src/contacts-mcp/` (TypeScript/Bun) — owns vCard contacts in `~/.contacts-mcp/store/`. We **talk to it via MCP**, never touch its files directly.

## Hard rules

These are not preferences. Violating any of them is a bug.

1. **No LLM calls in this codebase.** No `openai`, `anthropic`, `@anthropic-ai/sdk`, no inference. If a feature seems to need one, the feature belongs upstream. Push back instead of adding the dependency.
2. **No outbound message sends without explicit human approval.** "Approval" means an authenticated user clicked Approve (or the equivalent in CLI/MCP) and the audit log captured it. There is no autopilot mode. There will never be one.
3. **Read imsg-agent's SQLite read-only.** Always open with `{ readonly: true, fileMustExist: true }`. We never write to that database. Period.
4. **Never modify contacts-mcp's files directly.** All contact mutations go through its MCP tools.
5. **Atomic file writes for drafts.** Write to a temp file in the same directory, then `rename`. A crash mid-write must never produce a half-formed draft.
6. **Accessibility is non-negotiable.** Touch targets ≥ 48px, focus rings always visible, font scaling 100–200%, keyboard navigation for every action, axe-core clean on serious/critical. See [PLAN.md § Accessibility](PLAN.md#accessibility-commitments). If a design seems to require violating this, redesign.
7. **AGPL-3.0 license header on every source file.** Use the SPDX form: `// SPDX-License-Identifier: AGPL-3.0-or-later`. The `tools/scripts/add-license-headers.ts` script enforces this in CI.
8. **Audit every state-changing action.** Approve, reject, schedule, cancel, edit, sign-in, permission change → `audit_log` row with `user_id`, `action`, `target`, `payload_json`, `created_at`.
9. **Permission checks on every mutating path** (web route, MCP tool, CLI command). Use `requirePermission` from `packages/auth`. No exceptions.
10. **Multi-tenant from day one.** Every query that touches user data takes a `tenantId`. Default-deny on missing context.

## Stack at a glance

See [PLAN.md § Stack](PLAN.md#stack) for the full table. The compressed version:

- TypeScript 5.7+, Node 22 LTS (prod) / Bun (dev)
- Next.js 15 App Router, React 19, Tailwind, shadcn/ui (Radix)
- Drizzle + SQLite (via `better-sqlite3`)
- better-auth
- Vitest + Playwright + axe-core
- Biome (lint + format, no ESLint, no Prettier)
- Bun workspaces + Turborepo

## Repository layout

See [PLAN.md § Repository layout](PLAN.md#repository-layout). Cliff notes:

- `apps/{web,cli,mcp}` — the three surfaces. Each is a thin shell.
- `packages/core` — domain types and services. **No I/O here.** Adapters and DB layers do the I/O; core orchestrates.
- `packages/adapters/_contract` — the `ChannelAdapter` interface. If you change it, update every adapter and [docs/channel-adapters.md](docs/channel-adapters.md) in the same PR.
- `packages/adapters/{imessage,discord,...}` — one folder per channel.
- `packages/db` — Drizzle schema + migrations for the hub's *own* DB. Not for imsg-agent's archive.
- `packages/auth` — better-auth config and the `Permission` enum.
- `packages/mcp-client` — wraps `@modelcontextprotocol/sdk` for outbound MCP calls (currently just contacts-mcp).
- `packages/ui` — shared React components.

## Conventions

### Code style

- **Biome formats and lints.** Run `bun run lint`. Don't argue with the formatter.
- **Strict TypeScript.** No `any`. No `as` unless commenting why. No `// @ts-expect-error` without an explanation and a tracked issue.
- **Zod schemas double as types.** `type Foo = z.infer<typeof FooSchema>`. Don't write a TS type and a Zod schema separately.
- **Imports** sorted by Biome. Workspace imports use the package name (`@commshub99/core`), not relative paths across packages.
- **Filenames** are `kebab-case.ts` for modules, `PascalCase.tsx` for React components.
- **No default exports** except for Next.js page/layout files where the framework requires it.

### Comments

- Default to no comments. Names should carry the meaning.
- Write a comment only when the *why* is non-obvious: a hidden invariant, a workaround for a specific upstream bug, a security-relevant check that looks redundant.
- Never write `// added for X feature` or `// used by Y` — that belongs in PR descriptions and rots fast.
- Never write multi-paragraph docstrings. One line max.

### Tests

- **Vitest** for unit and integration. **Playwright** for e2e. Don't mix.
- **Test names** are sentences: `it('rejects approval when user is readonly', …)`.
- **Adapter tests** run against fixture SQLite files in `packages/adapters/imessage/test/fixtures/`. Don't mock the SQLite driver; mock surface is the adapter interface, not its internals.
- **No mocks for the DB layer.** Use a transaction that rolls back, or a fresh in-memory SQLite per test.
- **A11y tests** in Playwright with `@axe-core/playwright`. Failing serious/critical violations fails CI.

### Errors

- Throw typed errors from `packages/core/src/errors.ts` (`PermissionError`, `NotFoundError`, `ValidationError`, `ConflictError`, etc.).
- Route handlers map typed errors to HTTP status codes in one place.
- Never swallow an error to "make it work." If a draft write fails, surface it, log it, audit it.

### Logging

- `pino` for structured logs.
- Server logs to stdout (JSON in prod, pretty in dev).
- **Never log message bodies, draft contents, contact PII, or auth tokens.** Log IDs and metadata only. The whole point of this project is privacy; the logs must not undo it.
- MCP tool calls log on stderr (stdio protocol uses stdout for the wire).

### Commits and PRs

- Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`).
- One logical change per PR. Bug-fix PRs do not include unrelated cleanup.
- PR description includes: what changed, why, how to test, accessibility notes if UI changed.
- Update `CHANGELOG.md` in the same PR as the change.

## Working with the upstream projects

### imsg-agent (`~/src/imsg-agent`)

- **Database path:** `~/imsg-data/imessage.sqlite` (override via `IMSG_DATA_DIR` env). WAL mode, multi-reader safe.
- **Key tables:** `chats`, `messages`, `attachments`, `reactions`, `contacts`, `contact_points`, `chat_contact_matches`, `messages_fts` (FTS5), `meta`. Schemas in their `agent/` directory; read before writing queries.
- **Drafts directory:** `~/imsg-data/drafts/` — Markdown files with frontmatter. Fields we care about: `chat_id`, `source_rowid`, `approved` (bool), `proposed_at`, `reasoning`, `body` in the Markdown body.
- **Outbox:** `~/imsg-data/outbox/` — imsg-agent's send loop watches this and sends. Approving = atomic-rename from `drafts/` to `outbox/`.
- **Sent / errors:** `~/imsg-data/sent/`, `~/imsg-data/errors/` — read-only for us; we display these but don't move them.
- **Their MCP server (`imsg-mcp`)** is read-only and exposes browse-style tools. We don't currently consume it (we read SQLite directly), but it's an option for future cross-network deploys.

If you need a query that the schema doesn't easily support, **don't add a column to imsg-agent's SQLite.** Add a sidecar table in commshub99's own DB instead, keyed by their natural IDs.

### contacts-mcp (`~/src/contacts-mcp`)

- **Storage:** `~/.contacts-mcp/store/` — git-backed vCard files. Don't touch.
- **MCP transport:** stdio. We spawn it as a child process via `packages/mcp-client`.
- **Tools we use:** `resolve_contact_points`, `search_contacts`, `get_contact`. Tools we may use later: `update_contact` (when a user fixes a contact name from our UI), `create_contact` (claim-an-unmatched-handle flow).
- **Identity normalization:** phones are E.164 (libphonenumber-js), emails are lowercased and trimmed. iMessage handles must be normalized the same way before matching.

## Common workflows

### Adding a new channel adapter

1. Read [docs/channel-adapters.md](docs/channel-adapters.md) end-to-end.
2. Copy `packages/adapters/_contract/template/` to `packages/adapters/<channel>/`.
3. Implement the interface. Set capability flags accurately — "supports scheduled send" is enforced at runtime; lying breaks the UI.
4. Write fixture-based integration tests.
5. Register in `apps/web/src/server/bootstrap.ts` behind a config flag.
6. Add a section to [docs/deployment.md](docs/deployment.md) explaining required credentials.
7. Update the adapter doc with anything you learned.

### Adding a Drizzle migration

```bash
bun run db:generate   # creates SQL in packages/db/migrations
bun run db:migrate    # applies to local DB
```

Never edit a migration after it's merged. Add a new one to fix.

### Running locally

```bash
bun install
cp .env.example .env                       # set INITIAL_ADMIN_EMAIL, IMSG_DATA_DIR
bun run db:migrate
bun run db:seed
bun run dev                               # starts apps/web on :3000
```

### Running tests

```bash
bun run test          # unit + integration via Vitest
bun run test:e2e      # Playwright e2e (requires dev server)
bun run lint          # Biome
bun run typecheck     # tsc --noEmit
```

CI runs all four on every PR. Run them locally before pushing.

## When in doubt

- **Smaller scope wins.** We can always add. Removing a public surface costs more.
- **Match the upstream projects' boundaries.** If imsg-agent or contacts-mcp owns something, don't reimplement it.
- **Ask the user before destructive operations.** Even with a tool's blessing, deleting drafts, dropping tables, or rewriting their `~/imsg-data/` is a confirm-first action.
- **Accessibility is the tiebreaker.** When two designs are otherwise equivalent, pick the one a user with tremor can use without a steady hand.
- **Update the docs in the same PR as the code.** Stale docs are worse than no docs. PLAN, ROADMAP, TODO, and CLAUDE.md are first-class artifacts.

## Permitted and forbidden actions

**Permitted without asking** (in a sandboxed dev environment):
- Reading any file in this repo or in `~/src/imsg-agent`, `~/src/contacts-mcp`.
- Reading `~/imsg-data/imessage.sqlite` (read-only, ever).
- Writing files inside this repo's worktree.
- Running `bun`, `node`, `git status`, `git diff`, `git log`.
- Running tests, builds, linters.

**Ask before doing**:
- `git push`, opening PRs, creating branches the user didn't request.
- Writing inside `~/imsg-data/` or `~/.contacts-mcp/`. (In production this is the live data; in dev, confirm the user has a fixture path set.)
- Installing global packages or modifying `~/.zshrc`, `~/.bashrc`, etc.
- Anything network-facing the user didn't ask for.

**Never do**:
- Add an LLM dependency or API key.
- Send a message on behalf of a user.
- Delete files outside this repo without explicit, scoped authorization.
- Skip git hooks (`--no-verify`) without explicit user instruction.
- Force-push to `main`.

## Sources of truth

- This file describes the AI-agent contract for the repo. Treat it as load-bearing.
- [PLAN.md](PLAN.md), [VISION.md](VISION.md), [ROADMAP.md](ROADMAP.md), [TODO.md](TODO.md) describe the project.
- The code is the truth about *what is*; the docs are the truth about *what should be*. When they disagree, file an issue and reconcile.

If something here is wrong or outdated, fix it in your PR. This file is part of the project, not above it.
