---
title: 'MemPalace: 170 Tokens to Recall Everything — A Long-Term Memory System for AI Agents'
description: 'MemPalace is a local AI memory system using a memory palace architecture, AAAK 30x compression, 170-token startup, 96.6% LongMemEval accuracy, fully offline with MCP integration.'
slug: mempalace-ai-memory-system
date: '2026-04-08T01:41:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- ai-agent
- claude-code
- MCP
- Python
draft: false
---

Six months of daily AI conversations. 19.5 million tokens of history. Start a new session and it remembers nothing. You can dump important things into CLAUDE.md, but that file quickly balloons to thousands of lines, eating up your context window on every startup.

[MemPalace](https://github.com/milla-jovovich/mempalace) takes a different approach: instead of cramming all memories into the prompt, build a structured memory vault that AI queries on demand. Startup loads just 170 tokens, search accuracy hits 96.6%, completely offline, zero API calls.

## The Memory Palace Architecture

MemPalace uses the ancient Greek memory technique as its organizational metaphor:

- **Wing**: Projects, people, or topics. One wing per major category
- **Room**: Sub-topics within a wing — auth, billing, deploy
- **Hall**: Memory type corridors shared across all wings
  - `hall_facts` — locked-in decisions
  - `hall_events` — sessions and milestones
  - `hall_discoveries` — breakthroughs
  - `hall_preferences` — habits and opinions
  - `hall_advice` — recommendations
- **Closet**: Compressed summaries pointing to original content
- **Drawer**: Verbatim original files, preserved losslessly
- **Tunnel**: Cross-wing connections when the same room appears in multiple wings

The structure alone improves search accuracy. Benchmark results:

| Search Scope | R@10 | Improvement |
|-------------|------|-------------|
| All closets | 60.9% | — |
| Within wing | 73.1% | +12% |
| Wing + hall | 84.8% | +24% |
| Wing + room | 94.8% | +34% |

Structure alone delivers a 34% accuracy boost — no fancy algorithms needed.

## AAAK Compression Format

This is MemPalace's most interesting design. AAAK is an AI-readable shorthand achieving 30x compression.

Original (~1,000 tokens):

```
Priya manages Driftwood team: Kai (backend, 3 years), Soren (frontend),
Maya (infrastructure), Leo (junior, started last month). Building SaaS
analytics platform. Current sprint: auth migration to Clerk. Kai
recommended Clerk over Auth0 based on pricing and DX.
```

AAAK format (~120 tokens):

```
TEAM: PRI(lead) | KAI(backend,3yr) SOR(frontend) MAY(infra) LEO(junior,new)
PROJ: DRIFTWOOD(saas.analytics) | SPRINT: auth.migration→clerk
DECISION: KAI.rec:clerk>auth0(pricing+dx) | ★★★★
```

The key point: no decoder required. Any LLM reads it natively — Claude, GPT, Llama, Mistral. It's essentially structured English abbreviations, not binary encoding.

## Layered Memory Loading

MemPalace divides memory into four layers, loaded incrementally:

| Layer | Content | Size | When Loaded |
|-------|---------|------|-------------|
| L0 | Identity — who is this AI | ~50 tokens | Always |
| L1 | Critical facts — team, projects, preferences | ~120 tokens (AAAK) | Always |
| L2 | Room recall — recent sessions | On demand | When topic surfaces |
| L3 | Deep search — semantic across all closets | On demand | When explicitly asked |

Startup loads only L0 + L1, about 170 tokens total. Compared to alternatives:

| Approach | Tokens Loaded | Annual Cost |
|----------|---------------|-------------|
| Paste everything | 19.5M — impossible | Impossible |
| LLM summaries | ~650K | ~$507 |
| **MemPalace wake-up** | **~170** | **~$0.70** |
| **MemPalace + 5 searches** | **~13,500** | **~$10** |

## Knowledge Graph: Facts Have Expiry Dates

MemPalace includes a temporal knowledge graph stored in local SQLite:

```python
kg.add_triple("Kai", "works_on", "Orion", valid_from="2025-06-01")
kg.add_triple("Maya", "assigned_to", "auth-migration", valid_from="2026-01-15")

# Kai leaves the Orion project
kg.invalidate("Kai", "works_on", "Orion", ended="2026-03-01")

# Query current state
kg.query_entity("Kai")
# → [Kai → works_on → Orion (ended), Kai → recommended → Clerk]

# Historical queries
kg.query_entity("Maya", as_of="2026-01-20")
# → [Maya → assigned_to → auth-migration (active)]
```

Every fact has a validity window. Invalidation marks end dates without deletion. This solves the most common CLAUDE.md problem: stale information that nobody cleans up, causing the AI to act on outdated data.

The knowledge graph also detects contradictions — tasks assigned to the wrong person, tenure mismatches, outdated sprint end dates.

## Claude Code Integration

### MCP Server

```bash
claude mcp add mempalace -- python -m mempalace.mcp_server
```

Once installed, Claude Code auto-discovers 19 MCP tools covering search, storage, knowledge graph queries, and agent diaries.

### Auto-Save Hooks

Add two hooks to your Claude Code configuration:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{"type": "command",
        "command": "/path/to/mempalace/hooks/mempal_save_hook.sh"}]
    }],
    "PreCompact": [{
      "matcher": "",
      "hooks": [{"type": "command",
        "command": "/path/to/mempalace/hooks/mempal_precompact_hook.sh"}]
    }]
  }
}
```

- **Save hook**: Fires every 15 messages, auto-extracts topics, decisions, and code changes
- **PreCompact hook**: Fires before context compression, emergency-saving current memory

No need to manually tell the AI to remember things — it saves automatically.

I previously covered [claude-view](/en/2026/04/07/claude-view-mission-control/), which monitors Claude Code sessions and costs from the outside. MemPalace extends AI's memory from the inside. They're complementary — claude-view shows you what AI did, MemPalace helps AI remember what it did.

## Specialist Agents

Create focused agents with independent memory:

```
~/.mempalace/agents/
 ├── reviewer.json    # code review patterns, bug records
 ├── architect.json   # design decisions, trade-offs
 └── ops.json         # deploys, incidents, infrastructure
```

Each agent maintains its own wing and AAAK diary, accumulating domain expertise across sessions:

```python
# Agent writes findings
mempalace_diary_write("reviewer",
  "PR#42|auth.bypass.found|missing.middleware.check|pattern:3rd.quarter|★★★★")

# Agent reads history
mempalace_diary_read("reviewer", last_n=10)
```

No need to stuff agent descriptions into CLAUDE.md. One line suffices: "You have MemPalace agents. Run mempalace_list_agents to see them."

## Installation and Usage

```bash
pip install mempalace

# Initialize
mempalace init ~/projects/myapp

# Mine different sources
mempalace mine ~/projects/myapp              # project code
mempalace mine ~/chats/ --mode convos        # conversation history
mempalace mine ~/chats/ --mode convos --extract general  # classified import

# Search
mempalace search "why did we switch to GraphQL"

# Generate startup context
mempalace wake-up > context.txt
```

Supports importing Claude conversations, ChatGPT exports, and Slack exports. Large files can be split first:

```bash
mempalace split ~/chats/ --dry-run   # preview
mempalace split ~/chats/             # split into individual sessions
```

## Compared to CLAUDE.md

CLAUDE.md is a flat text file — all information mixed together, no temporal awareness, fully loaded on every startup. MemPalace is a structured memory vault with layered loading, temporal knowledge graphs, and semantic search.

That said, MemPalace isn't perfect. It requires a Python environment, MCP server setup, and hook configuration. If you only need to remember a few coding conventions, CLAUDE.md is sufficient. MemPalace's value shows in long-term, large-scale, cross-project memory management.

## References

- [MemPalace GitHub Repository](https://github.com/milla-jovovich/mempalace)
- [AAAK Compression Format Spec](https://github.com/milla-jovovich/mempalace#aaak-compression)
- [LongMemEval Benchmarks](https://github.com/milla-jovovich/mempalace#benchmarks)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
