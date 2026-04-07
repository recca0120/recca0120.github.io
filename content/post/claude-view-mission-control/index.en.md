---
title: 'claude-view: Mission Control for Claude Code — Live Session Monitoring, Cost Tracking, and Analytics'
description: 'claude-view is a Rust-powered monitoring dashboard for Claude Code that tracks all sessions in real-time — conversations, costs, token usage, sub-agent trees — with 85 MCP tools and full-text search.'
slug: claude-view-mission-control
date: '2026-04-07T17:30:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- ai-agent
- MCP
- Rust
draft: false
---

After using Claude Code for a while, the most common question I get is "how much are you spending per month?" Honestly, I can't answer that. Claude Code's terminal interface doesn't show cumulative token costs, how many sub-agents ran, or which session burned the most money.

[claude-view](https://github.com/tombelieber/claude-view) fills that gap. One command opens a dashboard that monitors every Claude Code session on your machine in real-time.

```bash
npx claude-view
```

## What It Shows You

### Live Session Monitoring

Open the dashboard and you see all running Claude Code sessions, each card showing:

- Last message
- Model in use (Opus, Sonnet, Haiku)
- Current cost and token count
- Context window utilization (live percentage)
- Prompt cache countdown timer

Cards can be arranged in multiple layouts: Grid, List, Kanban, Monitor. Kanban mode groups sessions by project/branch in swimlanes — great when running multiple projects simultaneously.

### Conversation Browser

Click into any session for the full conversation history. Unlike the terminal view, claude-view visualizes tool calls — file reads, edits, bash commands, and MCP calls each get their own cards.

A Developer Mode toggle reveals hook metadata, event cards, and raw JSON. Invaluable for debugging.

Conversations can be exported as Markdown for documentation or feeding back to Claude for continuation.

### Sub-agent Tree View

Claude Code spawns sub-agents for subtasks. In the terminal you only see one level. claude-view renders the full tree structure with per-agent cost and token breakdowns at a glance.

### Full-Text Search

The search engine is [Tantivy](https://github.com/quickwit-oss/tantivy), a Rust-native Lucene-class full-text indexer. Search response times across 1,500 sessions stay under 50ms.

`Cmd+K` opens a command palette for quick session jumping and view switching.

## Analytics: Where Did the Money Go

This is where I see the most value.

### Dashboard Metrics

- Week-over-week session count, token usage, and cost comparison
- 90-day GitHub-style activity heatmap
- Most-used skills, commands, and MCP tools leaderboards
- Most active projects bar chart
- Cross-session totals for edits, reads, and bash commands

### AI Contributions Tracking

This feature quantifies Claude Code's output:

- Lines added/removed, files touched, commit counts
- Cost per commit, cost per session, cost per line ROI
- Opus vs Sonnet vs Haiku side-by-side comparison
- Re-edit rate: tracking whether your prompt quality is improving

There's also an experimental AI Fluency Score (0-100), calculated from your session history to measure how effectively you use AI.

## 85 MCP Tools

claude-view ships a plugin (`@claude-view/plugin`) that auto-loads with every Claude Code session.

```bash
claude plugin add @claude-view/plugin
```

The plugin provides 85 MCP tools: 8 hand-crafted core tools plus 77 auto-generated from the OpenAPI spec.

The core 8:

- `list_sessions`, `get_session`, `search_sessions`
- `get_stats`, `get_fluency_score`, `get_token_stats`
- `list_live_sessions`, `get_live_summary`

Once installed, you can ask Claude Code "how much did I spend today" or "which session took the longest last week" — it queries claude-view via MCP.

### 9 Built-in Skills

Beyond MCP tools, there are 9 built-in skills:

| Skill | Purpose |
|-------|---------|
| `/session-recap` | Summarize commits, metrics, duration |
| `/daily-cost` | Today's spending and tokens |
| `/standup` | Multi-session work log |
| `/coaching` | AI usage tips |
| `/insights` | Behavioral pattern analysis |
| `/project-overview` | Cross-session project summary |
| `/search` | Natural language search |
| `/export-data` | CSV/JSON exports |
| `/team-status` | Team activity overview |

## Technical Architecture

claude-view uses Rust for the backend and React for the frontend.

| Layer | Technology |
|-------|-----------|
| Web framework | Axum |
| Database | SQLite |
| Search engine | Tantivy |
| File I/O | Memory-mapped I/O |
| Real-time | SSE + WebSocket |
| Frontend | React + Vite + Dockview |
| Monorepo | Turbo + Bun |

Performance benchmarks (M-series Mac, 1,493 sessions):

| Metric | claude-view | Typical Electron Dashboard |
|--------|-------------|--------------------------|
| Download | ~10 MB | 150-300 MB |
| On disk | ~27 MB | 300-500 MB |
| Startup | <500 ms | 3-8 s |
| RAM | ~50 MB | 300-800 MB |
| Index 1,500 sessions | <1 s | N/A |

Rust's mmap + SIMD-accelerated JSONL parsing enables zero-copy from parse to response. Compared to Electron dashboards, it's 10x smaller and uses 6x less memory.

## Installation

Three options:

```bash
# Recommended
curl -fsSL https://get.claudeview.ai/install.sh | sh

# Or via npx
npx claude-view

# Install plugin (auto-starts with Claude Code)
claude plugin add @claude-view/plugin
```

Only prerequisite: Claude Code installed. Dashboard runs at `http://localhost:47892`.

All data stays local, zero telemetry, no account required.

## Compared to Other Tools

There are similar tools, but with different positioning:

- **ccusage**: CLI tool, token stats only, no GUI, no live monitoring
- **opcode**: Tauri-based GUI with session management but no multi-session chat browsing or search
- **CodePilot**: Electron chat UI for interacting *with* Claude Code, not monitoring it

claude-view is positioned as monitoring and analytics. If you already work in the terminal with Claude Code, it doesn't change your workflow — it just shows you more information.

I previously covered [AionUi](/en/2026/04/07/aionui-ai-cowork-app/), which unifies multiple agents into one GUI. claude-view takes a different approach: keep working in the terminal, but add a dashboard for tracking. The two can work together.

## Who Needs This

If you use Claude Code occasionally, you probably don't need this tool.

But if you use it daily, run multiple sessions simultaneously, and want to know where the money goes, which model gives the best ROI, and whether your prompt quality is improving — claude-view provides information density that the terminal simply can't match.

## References

- [claude-view GitHub Repository](https://github.com/tombelieber/claude-view)
- [claude-view Official Website](https://claudeview.ai)
- [Tantivy Full-Text Search Engine](https://github.com/quickwit-oss/tantivy)
- [Axum Web Framework](https://github.com/tokio-rs/axum)
