<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Release Smoke Checklist

Run this before pushing a release, deploying a remote dev server, or changing imsg-agent integration.

## Local App

- [ ] `bun install`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] `bun run build`
- [ ] `bun run --filter @commshub99/cli admin status`
- [ ] Sign in to the web app with a local admin user.
- [ ] Open Conversations and confirm recent iMessage rows load.
- [ ] Open Contacts and confirm contacts-mcp failure is either absent or shown as a non-fatal contacts error.
- [ ] Open Approvals and confirm drafts load.

## Approval Safety

- [ ] Edit a draft and save it.
- [ ] Approve the edited draft with hold-to-confirm.
- [ ] Confirm the generated outbox Markdown contains the edited body.
- [ ] Reject a disposable draft with a rules-review note.
- [ ] Confirm the rejected Markdown contains `rules_review_status`.
- [ ] Run `bun run --filter @commshub99/cli admin pending`.
- [ ] Approve a temp draft with `IMSG_DATA_DIR` pointed at a disposable directory.

## imsg-agent

- [ ] `launchctl print gui/$(id -u)/com.imsg-agent.archive-monitor`
- [ ] `launchctl print gui/$(id -u)/com.imsg-agent.worker`
- [ ] Confirm `~/imsg-data/imessage.sqlite` exists and is readable.
- [ ] Confirm `~/imsg-data/outbox` is drained by the worker.
- [ ] Confirm `~/imsg-data/sent` receives successful sends.
- [ ] Review `~/imsg-data/errors` and distinguish archived failures from new failures.

## Remote Dev Server

- [ ] Install workspace dependencies on the remote host.
- [ ] Run `bun run build` on the remote host.
- [ ] Confirm `apps/web/next.config.ts` includes every remote dev origin in `allowedDevOrigins`.
- [ ] Confirm workspace packages resolve on the server, especially `@commshub99/auth`.
- [ ] Start web with the same package manager used to install dependencies.
- [ ] Load the remote page and verify `/_next/*` resources do not emit cross-origin warnings.
- [ ] Sign in remotely and open Conversations, Contacts, and Approvals.

## Scheduling

- [ ] Run database migrations on a fresh temp database.
- [ ] Create a scheduled send row for a disposable draft.
- [ ] Run the schedule worker helper against the disposable draft.
- [ ] Confirm due sends are marked sent and future sends are left pending.
- [ ] Confirm failed sends retry only up to the configured max attempts.
