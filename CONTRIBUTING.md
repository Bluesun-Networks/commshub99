# Contributing to commshub99

Thanks for your interest. commshub99 is AGPL-3.0 open source — contributions stay free.

## Before you start

Read [VISION.md](VISION.md), [PLAN.md](PLAN.md), and [CLAUDE.md](CLAUDE.md). The hard rules in CLAUDE.md are not negotiable — no LLM calls in this codebase, no sending without approval, accessibility is non-negotiable.

## No CLA

No contributor license agreement. You keep your copyright. Your code is licensed AGPL-3.0-or-later when merged, same as the rest of the project. Every source file must carry the SPDX header: `// SPDX-License-Identifier: AGPL-3.0-or-later`.

## AGPL implications

If you run a modified version of commshub99 on a server and let others use it over the network, you must make your modified source available to those users. The [LICENSE](LICENSE) has the full terms. Self-hosted personal use does not trigger this. Running it for a business that serves external users does.

## What to work on

Pick the next unchecked item from [TODO.md](TODO.md). If you want to work on something not listed, open an issue first. For changes to a public surface (API, MCP tool definitions, channel adapter interface), open an issue and get a thumbs-up before writing code — these are harder to revise once shipped.

## Development setup

```bash
pnpm install
cp .env.example .env        # set INITIAL_ADMIN_EMAIL, IMSG_DATA_DIR
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Before opening a PR

```bash
pnpm lint        # Biome check — must pass
pnpm typecheck   # tsc --noEmit — must pass
pnpm test        # Vitest — must pass
pnpm build       # Turbo — must be clean
```

CI runs all four on every PR across linux-amd64, linux-arm64, and macOS Apple Silicon.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`. One logical change per commit.

## PR expectations

- One logical change per PR. Bug fixes don't include unrelated cleanup.
- PR description covers: what changed, why, how to test, accessibility notes if UI changed.
- Update `CHANGELOG.md` in the same PR (Keep a Changelog format).
- Update `TODO.md` if you completed a tracked item.
- If you changed the channel adapter interface, update [docs/channel-adapters.md](docs/channel-adapters.md) and every adapter in the same PR.

## Accessibility

New UI must meet WCAG 2.2 AA minimum. The first user has Parkinson's. Touch targets ≥ 48px, font scaling, keyboard navigation for every action, axe-core clean. CI enforces this with Playwright + axe. Do not merge UI that degrades the accessibility baseline.

## Questions

Open a GitHub Discussion or issue. Don't email maintainers directly for project questions.
