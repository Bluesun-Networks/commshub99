<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Single-Mac Deployment

This guide is for the local-first setup where imsg-agent, contacts-mcp, and commshub99 all run on one Mac.

## Prerequisites

- macOS with iMessage available.
- Bun 1.x.
- Node 22 LTS for production-style runs.
- A working imsg-agent data directory, usually `~/imsg-data`.
- contacts-mcp installed and buildable on the same machine.
- Optional remote access through Tailscale, SSH tunnel, or your own reverse proxy.

## Install

```bash
git clone https://github.com/zobrist/commshub99.git
cd commshub99
bun run upgrade
bun run typecheck
bun run lint
bun run test
```

## Environment

Set these in the shell, launchd plist, or process manager:

```bash
export IMSG_DATA_DIR="$HOME/imsg-data"
export COMMSHUB99_DB_PATH="$HOME/.commshub99/hub.db"
export COMMSHUB99_WEB_URL="http://localhost:3000"
```

If contacts-mcp is not on `PATH`, point the client at it:

```bash
export CONTACTS_MCP_ENTRY="$HOME/src/contacts-mcp/dist/index.js"
```

For remote Next.js development, add the remote browser origin to `apps/web/next.config.ts` under `allowedDevOrigins`.

## Database And First Admin

`bun run upgrade` applies database migrations. Re-run it after pulling new commits or deploying a new build.

```bash
bun run --filter @commshub99/cli admin users:create --email you@example.com --role admin
```

The CLI prints a temporary password when `--password` is omitted. Store it immediately.

Useful recovery commands:

```bash
bun run --filter @commshub99/cli admin users:list
bun run --filter @commshub99/cli admin users:reset-password --email you@example.com
bun run --filter @commshub99/cli admin users:set-role --email sibling@example.com --role readonly
bun run --filter @commshub99/cli admin users:disable --email old@example.com
bun run --filter @commshub99/cli admin users:clear-sessions --email you@example.com
```

## Run The Web App

For local development:

```bash
bun run dev
```

For a production-style smoke:

```bash
bun run build
bun run --filter @commshub99/web start
```

Then open `http://localhost:3000`, sign in as the first admin, and check Conversations, Contacts, and Approvals.

## imsg-agent Services

Check the archive monitor and worker:

```bash
launchctl print "gui/$(id -u)/com.imsg-agent.archive-monitor"
launchctl print "gui/$(id -u)/com.imsg-agent.worker"
```

Check hub status:

```bash
bun run --filter @commshub99/cli admin status
```

The status output labels historical send failures as `archived errors`. A non-zero archived error count is not automatically a current failure.

## Operator CLI

```bash
bun run --filter @commshub99/cli admin pending
bun run --filter @commshub99/cli admin edit UUID --text "Edited reply"
bun run --filter @commshub99/cli admin approve UUID
bun run --filter @commshub99/cli admin reject UUID --note "Why this should not be sent"
bun run --filter @commshub99/cli admin schedule UUID --at 2026-05-10T22:00:00-07:00
bun run --filter @commshub99/cli admin tail
```

Use a disposable `IMSG_DATA_DIR` when testing approve/reject behavior outside real data.

## Remote Troubleshooting

- If Next.js warns about cross-origin `/_next/*` requests, add the browser origin to `allowedDevOrigins`.
- If `@commshub99/auth` or another workspace package is missing, run `bun install` on the remote host and start the app through Bun from the repo root.
- If contacts do not load, verify `CONTACTS_MCP_ENTRY` or `CONTACTS_MCP_BIN`.
- If approval creates outbox files but nothing sends, check `com.imsg-agent.worker` and `~/imsg-data/errors`.
- If `admin status` shows old archived errors, compare `last sent` and `latest archived error` timestamps.

Run [release-smoke.md](release-smoke.md) before treating a deployment as ready.
