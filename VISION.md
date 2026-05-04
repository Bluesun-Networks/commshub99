# commshub99 — Vision

## The problem

Personal communications are fragmented across iMessage, SMS, email, Discord, WhatsApp, Slack, Signal — and the tooling to manage them is fractured to match. People who need help managing their communications (older relatives, people with motor or cognitive impairments, anyone overwhelmed by the volume) have no good way to delegate parts of that work to a trusted helper or to AI without giving up control.

Existing AI assistants either send messages autonomously (unsafe) or stop at "draft a reply" and dump that draft somewhere the user has to find. The middle ground — **AI proposes, human approves, system sends** — has no good UI.

## The vision

**commshub99 is the human's seat at the loop.** It is the open-source, AGPL-licensed control surface for managing all of a person's communications across every channel, with first-class support for review/approve/reject/schedule workflows over messages drafted by AI agents (or by a helper, or by the user themselves).

It is not an AI. It is the UI that makes AI-mediated communication safe, accessible, and inspectable.

## Founding use case

The first user is a family member with Parkinson's disease who needs help managing his communications. His adult children — geographically distributed — need shared, remote, role-scoped access to help him stay connected without taking over his identity. The system must:

- Show him a calm, accessible view of his conversations and any AI-drafted replies awaiting his approval.
- Let him approve, edit, reject, or schedule those drafts with large, forgiving controls.
- Let his children remotely review the same queue, suggest edits, or step in when he asks for help.
- Never send anything without explicit human approval.

If we get this right for one family, the same primitives serve every household, every small business, every person with a disability that affects communication, and every privacy-conscious user who wants AI help without surrendering control.

## Principles

1. **Human in the loop, always.** No outbound message leaves the system without an explicit, auditable human approval. There is no "auto-send" mode and there will never be one.
2. **Pluggable channels.** iMessage is P0; Discord, email, WhatsApp, SMS, Slack, Signal follow. Each channel is a swappable adapter implementing one interface. New channels ship as packages, not forks.
3. **No LLM inside the UI.** commshub99 has no API key, makes no model calls, and pays no inference cost. AI generation lives upstream (imsg-agent today, commsbot99 and others tomorrow). commshub99 is the seam that joins humans to those agents.
4. **Local-first, scale-ready.** Default deployment runs on one machine in one home. The architecture (stateless web tier, durable queue, replaceable storage) leaves room to scale to a server, then to a hosted offering, without a rewrite.
5. **Accessible by default.** WCAG 2.2 AA at minimum. Touch targets, font scaling, reduced motion, predictable layouts, and a simplified "Essentials" mode are not afterthoughts — they are the design baseline. The first user has Parkinson's; the design assumes tremor.
6. **Multi-tenant from day one.** Even when only one person is signed in, the system understands users, roles, and audit. Adding the next user is a config change, not an architectural shift.
7. **Open source, AGPL-3.0.** The code stays free. Network use triggers source disclosure. No CLA. Forks are welcome; selling closed-source SaaS on top of it is not.
8. **Three surfaces, one core.** Web UI is the primary surface. A TUI/CLI is for power users and remote-shell access. An MCP server lets other agents (commsbot99 first) drive the hub programmatically. All three are thin shells over the same core domain.
9. **Boring, durable choices.** SQLite over Postgres until pain demands otherwise. Files over databases when files suffice (drafts are Markdown). Standard web stack over novel runtimes. The project will outlive any one framework's hype cycle.

## Non-goals

- **Replacing native chat clients.** iMessage.app, Discord, etc. remain authoritative for live chat; commshub99 is the management/triage/approval layer on top.
- **Becoming a CRM.** Contact data lives in [contacts-mcp](https://github.com/zobrist/contacts-mcp). commshub99 displays it; it does not own it.
- **Hosting AI inference.** Generation is upstream. commshub99 surfaces drafts; it does not produce them.
- **Mobile apps in v1.** The web UI is responsive and works on mobile browsers. Native iOS/Android apps are a future project.
- **Federation, end-to-end encryption between hub instances.** Out of scope until the single-tenant story is solid.

## Success looks like

- One year in: the founding family uses it daily. A handful of other families have deployed their own instances. The Discord adapter has shipped, proving the pluggability model. Contributors have submitted at least one third-party adapter.
- Three years in: it is the reference implementation for "human-in-the-loop AI communications" — the thing security-conscious enterprises clone when they need to gate AI replies behind human approval, and the thing accessibility advocates point to as the example of how to build for users who need help.

## What this doc is not

This is the *why*. For the *what* and *how*, see [PLAN.md](PLAN.md). For the *when*, see [ROADMAP.md](ROADMAP.md). For the *next*, see [TODO.md](TODO.md).
