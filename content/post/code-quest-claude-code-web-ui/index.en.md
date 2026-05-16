---
title: 'Code Quest: A Claude Code Web UI That Runs in Interactive Mode — Just in Time for the June 15 Billing Change'
description: 'An open-source project that spawns Claude Code CLI directly and parses the full NDJSON protocol, with session fork/resume/worktree, Split deployment, file explorer, and Git integration. Why interactive mode matters after the June 15 Agent SDK billing change, and how the architecture differs from other approaches.'
slug: code-quest-claude-code-web-ui
date: '2026-05-16T14:00:00+08:00'
image: featured.png
categories:
- DevTools
tags:
- claude-code
- AI
- open-source
- web-ui
draft: false
---

Starting June 15, 2026, `claude -p` and Agent SDK usage no longer count toward subscription plan limits. Instead, eligible plans get a separate monthly Agent SDK credit — and once that's exhausted, usage moves to standard API billing. If you run automated scripts or headless pipelines today, that cost picture changes after June 15.

[code-quest](https://github.com/recca0120/code-quest) takes a different approach: it spawns Claude Code CLI directly, parses the full NDJSON interactive protocol, and delivers session management, file browsing, and Git integration in the browser. Interactive mode isn't covered by the new billing change — and that architectural choice turns out to be well-timed.

## What Changes on June 15?

From the official documentation:

> Starting June 15, 2026, Agent SDK and `claude -p` usage on subscription plans will draw from a new monthly Agent SDK credit, separate from your interactive usage limits.

In short: SDK and `claude -p` usage moves out of your subscription's shared pool into a separate credit bucket — which then bills at API rates once exhausted.

Affected:
- `claude -p` (pipe / headless mode)
- Agent SDK (Python / TypeScript)
- Claude Code GitHub Actions
- Third-party apps calling via Agent SDK

**Not affected**: interactive Claude Code sessions.

Once the monthly credit runs out, additional Agent SDK usage bills at standard API rates. If your workflow involves `claude -p` pipelines or SDK-wrapped automation, the cost math after June 15 is worth revisiting.

## How code-quest Works

Three-tier architecture:

```
Browser (React 19 + Tailwind v4)
    ↓ WebSocket /ws
Server (Express + Drizzle ORM)
    ↓ WebSocket /summoner
Summoner (local binary, compiled with Bun)
    ↓ child_process spawn
Claude Code CLI
```

**Summoner** is the core piece. Compiled into a standalone binary with Bun, it runs on your local machine and handles:

- Spawning Claude Code CLI with `--output-format stream-json --input-format stream-json`
- Parsing each line of NDJSON output (`system`, `assistant`, `user`, `result`, `stream_event`, `control_request`)
- Forwarding permission / elicitation prompts to the browser via WebSocket, then writing the response back to CLI stdin
- All local filesystem, Git, and OpenSpec operations

**Server** runs in the cloud, handling only routing and persistence (SQLite or MySQL) — it never touches local resources. The browser connects to the server via WebSocket; the server connects to the local Summoner via a separate WebSocket.

This Split deployment design means the server can run anywhere without being co-located with the Claude Code CLI.

## How It Differs from Other Web UIs

Existing Claude Code web interfaces follow roughly two patterns.

The first is the **UI layer** approach: the interface manages config files and session history, but actual Claude Code execution still happens in a terminal the user runs separately. These tools are useful for browsing and reviewing, but they can't intercept permission prompts from the UI, and session fork/resume requires manual steps.

The second is the **bridge approach**: the CLI connects back to the server via an SDK WebSocket path, and the UI receives the streamed output. This creates a real connection between UI and CLI — but the underlying transport is SDK mode. After June 15, that usage counts against the Agent SDK credit.

code-quest takes a third path: **spawn the CLI directly, in interactive mode**.

- **Not affected by the June 15 change**: interactive mode usage stays within subscription limits, outside Agent SDK credit
- **Full protocol control**: every `control_request` (permission prompts, elicitation) is handled in the browser in real time — not just observed as output
- **Split deployment**: server runs in the cloud, Summoner runs locally, no co-location required
- **First-class session operations**: fork, resume, rename are built-in features with DB persistence, not manual workarounds

## Features

### Session Management

Each Claude Code session maps to a channel:

- **Spawn**: create a new session
- **Resume**: restore from DB; CLI restarts with `--resume <session-id>`
- **Fork**: branch from an existing session state to explore a different approach
- **Rename**: label sessions for easy retrieval

Full NDJSON event history is stored in DB. `content_block_delta` events — streaming deltas that account for roughly 80% of all traffic — are split into a separate table and excluded from session history reads by default, keeping queries lightweight.

### Git Worktree Support

code-quest has full worktree lifecycle management: create, list, delete, archive, rename. Each session can bind to its own worktree, letting multiple tasks run on separate branches without stepping on each other.

This is especially useful when running multiple Claude Code sessions in parallel — each works in an isolated worktree, so changes don't conflict.

### File Explorer

- Browse directories, read files, view diffs
- Git status integration (modified, added, deleted files)
- Fuzzy search via Fuse.js
- RootGuard prevents directory traversal; `EXPLORER_ROOTS` configures which paths are accessible

### Real-Time Push

File, Git, and OpenSpec state changes don't require polling. `packages/broadcaster` uses a DataSource / pub-sub pattern backed by chokidar file watching — changes flow automatically from Summoner → Server → browser as they happen.

### WebSocket Reconnection

The custom ResumableSocket tracks sequence numbers. On reconnect, it replays missed events from a 500-event circular buffer. If the gap is too large to recover, it signals the client to refresh the full state instead.

### OpenSpec Integration

code-quest has built-in support for the OpenSpec format. You can create, archive, and toggle spec tasks directly from the interface, with real-time spec state synced to the browser automatically.

## Getting Started

```bash
git clone https://github.com/recca0120/code-quest.git
cd code-quest
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

Copy `apps/server/.env.example` and adjust as needed. Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | `3000` | Server port |
| `DATABASE_SQLITE_URL` | — | SQLite path, e.g. `file:./data/code-quest.db` |
| `SUMMONER_MODE` | `local` | `local` (same machine) or `remote` (split deployment) |
| `SUMMONER_TOKEN` | — | Bearer token for remote Summoner auth |
| `CLI_AUTO_MODE` | `true` | Pass `--auto-mode` to Claude Code |
| `EXPLORER_ROOTS` | home dir | Comma-separated allowed root paths |

For remote mode (server in the cloud, Summoner on your machine): set `SUMMONER_MODE=remote` on the server, configure `SUMMONER_TOKEN` on the Summoner, and point it at the server's WebSocket endpoint.

## Building an API on Top

The architecture is already structured for this. The Server is the central hub for all requests — adding HTTP API endpoints there, then routing them through the existing WebSocket channel to the Summoner, which writes to CLI stdin, closes the loop. The plumbing is already in place; it just needs an external-facing interface.

That API runs over interactive mode underneath, so it doesn't touch Agent SDK credit. If you need to drive Claude Code programmatically without SDK billing, the architecture has a clear path for it.

## Wrapping Up

Interactive mode, full protocol implementation, Split deployment — these three architectural choices give code-quest a distinct position after the June 15 billing change. Subscription usage stays in interactive limits, permission prompts are handled in the browser, and the server runs independently from the local Summoner. If you're looking for a way to operate Claude Code fully from the browser, this project is worth trying.

## References

- [code-quest GitHub](https://github.com/recca0120/code-quest)
- [Claude Agent SDK documentation](https://code.claude.com/docs/en/agent-sdk/overview)
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
