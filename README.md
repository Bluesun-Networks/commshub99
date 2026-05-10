# commshub99

The open-source, AGPL-3.0 communications hub. **Humans review, approve, reject, and schedule messages across every channel they care about** — starting with iMessage and growing to Discord, email, WhatsApp, SMS, Slack, and Signal. Built so AI agents can propose replies, but only humans can send them.

> **Status:** Local-first v0 is in progress. The repo now has a working Next.js web app, local email/password auth, iMessage conversation/contact/draft reads, admin-gated approve/reject/edit flows, scheduling primitives, and operator CLI commands. MCP tools, invite onboarding, contact correction, and schedule UI are still upcoming.

## Why this exists

Communications are scattered across a dozen apps. Tools that try to help — AI assistants in particular — either send on your behalf (unsafe) or stop at "here's a draft" and leave the routing to you. The middle ground is missing: **AI proposes, human approves, system sends.** commshub99 is that middle ground.

The first user is a family member with Parkinson's disease whose adult children need shared, role-scoped, remote access to help him manage his communications without taking over. If we get this right for one family, the same primitives serve every household, every small business, every accessibility-first user, and every privacy-conscious self-hoster.

Read [VISION.md](VISION.md) for the full reasoning.

## What this is (and isn't)

**Is:** the human-in-the-loop UI / CLI / MCP server that surfaces conversations and AI-drafted replies, with a tremor-safe approval workflow and a multi-tenant role model.

**Isn't:** an AI. There are no LLM calls in this codebase. Generation lives upstream in [imsg-agent](https://github.com/zobrist/imsg-agent) (today) and commsbot99 (planned).

**Isn't:** a contacts manager. Contact data lives in [contacts-mcp](https://github.com/zobrist/contacts-mcp); commshub99 displays it via MCP.

## Architecture in one diagram

```
  Browser ─────► apps/web (Next.js)  ─┐
  Terminal ───► apps/cli (operator CLI) ─┼─► packages/core ─► packages/adapters/{imessage, discord, …}
  commsbot99 ─► apps/mcp (MCP)      ─┘                           │
                                                                 ▼
                            ┌──────────────────────┐  ┌────────────────────┐
                            │  ~/imsg-data/        │  │  contacts-mcp      │
                            │   imessage.sqlite    │  │  (vCard + git)     │
                            │   drafts/, outbox/   │  └────────────────────┘
                            └──────────────────────┘
```

Three surfaces (web, CLI, MCP) over one core. iMessage adapter reads imsg-agent's SQLite directly and manages its Markdown drafts. Contact enrichment goes over MCP to contacts-mcp. The hub never calls an LLM, never sends without explicit approval, and never writes to imsg-agent's database.

Full architecture in [PLAN.md](PLAN.md).

## Documentation

| Doc                                         | Purpose                                                       |
| ------------------------------------------- | ------------------------------------------------------------- |
| [VISION.md](VISION.md)                      | Why this project exists, principles, non-goals.               |
| [PLAN.md](PLAN.md)                          | Architecture, stack, repo layout, data flow, security.        |
| [ROADMAP.md](ROADMAP.md)                    | Milestones from v0.1 through v1.0+.                           |
| [TODO.md](TODO.md)                          | Actionable tasks with suggested AI-coder model per item.      |
| [CLAUDE.md](CLAUDE.md)                      | How AI coders should work in this repo.                       |
| [docs/channel-adapters.md](docs/channel-adapters.md) | The contract for adding a new channel.                |
| [docs/deployment.md](docs/deployment.md) | Single-Mac install and troubleshooting guide.                |
| [docs/release-smoke.md](docs/release-smoke.md) | Checks before release or remote dev deploy.                |

`docs/data-model.md` and `docs/accessibility.md` will land as those surfaces harden.

## Project values

1. **Human in the loop, always.** No autopilot. Ever.
2. **Pluggable channels.** New channels ship as packages, not forks.
3. **No LLM in the UI.** Generation is upstream. The hub has no API key.
4. **Local-first, scale-ready.** One Mac in v1; server-backed multi-tenant later.
5. **Accessible by default.** Designed assuming the user has tremor.
6. **Multi-tenant from day one.**
7. **AGPL-3.0.** Code stays free. No CLA. Forks welcome; closed-source SaaS on top of it is not.
8. **Boring, durable choices.** SQLite over Postgres until pain demands otherwise. Markdown over schemas where files suffice.

## Stack

TypeScript end-to-end. Next.js 15 + React 19 for the web app. Drizzle + SQLite for the hub's own data. Custom local email/password auth with admin/readonly roles. `@modelcontextprotocol/sdk` for MCP surfaces. A Node-based operator CLI. Bun + Turborepo. Biome for lint/format. Vitest for unit/integration tests.

Full table in [PLAN.md § Stack](PLAN.md#stack).

## Running locally

```bash
bun install
bun run --filter @commshub99/db db:migrate
bun run --filter @commshub99/cli admin users:create --email you@example.com --role admin
bun run dev                         # apps/web on :3000
```

Set `IMSG_DATA_DIR` if imsg-agent data is somewhere other than `~/imsg-data`.

## Contributing

Read [VISION.md](VISION.md), [PLAN.md](PLAN.md), and [CLAUDE.md](CLAUDE.md) before opening a PR. Pick the next unchecked item from [TODO.md](TODO.md). Open an issue first for anything that changes a public surface or the channel-adapter contract.

No CLA. Conventional Commits. AGPL-3.0 license header on every source file.

## License

[AGPL-3.0-or-later](LICENSE). If you run a modified version on a network server, you must offer source to its users. That's the deal that keeps this project free.
