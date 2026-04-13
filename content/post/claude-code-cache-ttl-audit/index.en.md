---
title: 'claude-code-cache-fix: Detect and Repair Anthropic''s Silent Cache TTL Regression'
description: 'In March 2026 Anthropic silently flipped Claude Code cache TTL from 1h back to 5m, with monthly costs inflating 15-53%. Developer cnighswonger used the ephemeral_5m / ephemeral_1h fields in ~/.claude/projects JSONL to pinpoint March 6 as the regression date, then shipped an npm package to fix it.'
slug: claude-code-cache-ttl-audit
date: '2026-04-14T02:00:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- npm
draft: true
---

[The previous post](/en/2026/04/13/claude-code-session-cost-cache-misconception/) explained Claude Code's prompt caching mechanics. While researching it I found a very dramatic incident: in March 2026 Anthropic **silently switched the default cache TTL for Claude Code's main agent from 1 hour back to 5 minutes**, causing community-measured monthly costs to inflate 15–53%.

Worse, TTL is **decided automatically by the client — there's no user setting**. Anthropic employee Jarred Sumner publicly defended the change and **refused to add a user setting**, arguing sub-agents legitimately need 5m.

But [cnighswonger](https://github.com/cnighswonger/claude-code-cache-fix) did two things: he used `~/.claude/projects` JSONL logs to **pinpoint March 6 as the exact regression date**, then shipped an npm package that **fixes the regression directly**. This post is about that tool.

## Incident Recap

- **2026/02/01**: Anthropic raised the Claude Code default TTL from 5 minutes to 1 hour
- **2026/02/27 ~ 03/08**: Silently reverted to 5 minutes
- **Late 2026/03**: Mass user reports of quota drain. A $200/month Max user said "never hit a quota before March, now I'm capped constantly"
- **2026/04/13**: Sumner publicly responded, arguing 5m is actually cheaper for one-shot calls, **refused to add a user setting**

Community math: for interactive long-session workflows, 5m TTL inflates monthly cost by **15–53%** vs 1h — every coffee break, IDE switch, or thinking pause longer than 5 minutes triggers a `cache_creation` write instead of a `cache_read`.

## Why Cache Mysteriously Breaks

While building the fix, cnighswonger uncovered three client-side bugs that silently break cache:

1. **Attachment block drift**: on session resume, blocks containing skills, MCP servers, deferred tools, and hooks "drift to later messages" instead of staying in `messages[0]`. The prefix hash changes, cache fully invalidates
2. **Unstable cc_version fingerprint**: the version fingerprint is computed from `messages[0]` content including meta/attachment blocks; when those drift, the fingerprint changes
3. **Inconsistent tool ordering**: tool definitions can arrive in different orders between turns, breaking prefix consistency

These are all client bugs, independent of any server-side TTL changes — but combined they create the subjective experience of "why does cache hit rate suddenly tank after I resume?"

## Using claude-code-cache-fix

### Install

```bash
npm install -g claude-code-cache-fix
```

### Usage (pick one)

**Option A: wrapper script (recommended)**

```bash
claude-fixed [any claude args]
```

**Option B: alias replacing claude**

```bash
alias claude='NODE_OPTIONS="--import claude-code-cache-fix" node "$(npm root -g)/@anthropic-ai/claude-code/cli.js"'
```

**Option C: per-invocation env var**

```bash
NODE_OPTIONS="--import claude-code-cache-fix" claude
```

Under the hood, a Node.js preload module intercepts API requests before they're sent, normalizing attachment blocks, fingerprint, and tool ordering to restore prefix consistency.

### Live TTL Status in Your Status Line

After install, the tool writes quota state to `~/.claude/quota-status.json`. Pair it with `quota-statusline.sh` to see this in your Claude Code status line:

- **Q5h%** (5-hour quota usage) + burn rate
- **Q7d%** (weekly quota usage)
- **TTL tier**: shows `TTL:1h` when healthy, **red `TTL:5m` when the server has downgraded you**
- `PEAK` flag during weekday peak hours (UTC 13:00–19:00)
- Cache hit rate

For anyone who lives in Claude Code and dreads mysterious quota drain, **this status line beats any post-hoc analysis**.

### Cost Reports

```bash
node tools/cost-report.mjs                    # today
node tools/cost-report.mjs --date 2026-04-08  # specific date
node tools/cost-report.mjs --since 2h         # last 2 hours
node tools/cost-report.mjs --admin-key <key>  # cross-check with Admin API
```

Reads `~/.claude/usage.jsonl` (written by the interceptor, not Claude Code's native session logs).

## Don't Want to Install npm? Audit Historical TTL Anyway

cnighswonger's tool only sees data captured after install. To **review your past months of TTL distribution**, you can use the same approach he used in issue #46829: scan `~/.claude/projects` JSONL files and look at each assistant message's `usage.cache_creation` object:

```json
{
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 6561
  }
}
```

These fields come straight from Anthropic's API, bypassing any client display logic.

I distilled the approach into a 60-line Python that scans every project at once:

```python
#!/usr/bin/env python3
"""Audit Claude Code prompt cache TTL across all projects.
Inspired by cnighswonger/claude-code-cache-fix's quota analysis."""
import json, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path.home() / ".claude/projects"
TOP = 30
if "--top" in sys.argv:
    TOP = int(sys.argv[sys.argv.index("--top")+1])

stats = defaultdict(lambda: {"5m": 0, "1h": 0, "read": 0, "sessions": set()})

for jsonl in ROOT.rglob("*.jsonl"):
    proj = jsonl.parent.name
    try:
        with jsonl.open() as fp:
            for line in fp:
                try: d = json.loads(line)
                except: continue
                msg = d.get("message")
                if not isinstance(msg, dict): continue
                u = msg.get("usage") or {}
                cc = u.get("cache_creation") or {}
                w5 = cc.get("ephemeral_5m_input_tokens", 0)
                w1 = cc.get("ephemeral_1h_input_tokens", 0)
                if w5 or w1:
                    stats[proj]["5m"] += w5
                    stats[proj]["1h"] += w1
                    stats[proj]["read"] += u.get("cache_read_input_tokens", 0)
                    stats[proj]["sessions"].add(jsonl.stem)
    except Exception as e:
        print(f"skip {jsonl}: {e}", file=sys.stderr)

rows = []
for p, s in stats.items():
    tw = s["5m"] + s["1h"]
    if tw == 0: continue
    rows.append((p, tw, s["5m"], s["1h"], s["1h"]/tw*100, s["read"], len(s["sessions"])))
rows.sort(key=lambda r: -r[1])

w = 55
print(f"{'Project':<{w}} {'5m writes':>13} {'1h writes':>13} {'1h%':>6} {'sess':>5}")
print("-" * (w + 42))
for p, tw, w5, w1, pct, rd, sess in rows[:TOP]:
    print(f"{p[:w]:<{w}} {w5:>13,} {w1:>13,} {pct:>5.1f}% {sess:>5}")

t5 = sum(s["5m"] for s in stats.values())
t1 = sum(s["1h"] for s in stats.values())
tr = sum(s["read"] for s in stats.values())
print("-" * (w + 42))
print(f"TOTAL writes — 5m: {t5:,}  1h: {t1:,}  1h share: {t1/(t5+t1)*100:.1f}%")
print(f"TOTAL cache reads:  {tr:,}")
```

My machine, 4 months of logs:

```
Project                                  5m writes     1h writes    1h%   sess
-------------------------------------------------------------------------------
subagents                              369,275,664   825,966,925  69.1%  5261
work-project-a                                   0   238,986,709 100.0%    89
work-project-b                                   0   142,661,382 100.0%     2
side-project-c                                   0    50,753,727 100.0%     9
... (everything else 0 / 100%)
-------------------------------------------------------------------------------
TOTAL writes — 5m: 369,275,664  1h: 1,344,488,569  1h share: 78.5%
```

Sliced by month (main agent only, sub-agents excluded):

| Month | 5m writes | 1h writes | 1h% |
|-------|-----------|-----------|-----|
| 2026-02 | 0 | 546K | 100% |
| 2026-03 | 0 | **390M** | 100% |
| 2026-04 | 0 | 128M | 100% |

## Why My Data Wasn't Affected

My main agent has zero 5m writes for the entirety of March, which doesn't match cnighswonger's "5m surge after 3/6" data. Three possible explanations:

1. The regression never affected the main agent, only sub-agents (consistent with Sumner's defense)
2. The regression only rolled out to a subset of users; I happened to be in the control group
3. Some client version or config path I was on didn't hit the regression code path

A single machine's data **can't distinguish between these three**. So the conclusion isn't "Anthropic is fine" or "Anthropic is definitely broken" — **the conclusion is you must audit your own data**.

If your scan shows large 5m writes on main projects in March, you were a regression victim. Strongly recommend installing cnighswonger's tool — beyond live TTL visibility, it also fixes the attachment-drift class of side effects.

## Tool Selection Guide

| Scenario | Tool |
|----------|------|
| Heavy user wanting live TTL + quota visibility | `claude-code-cache-fix` status line |
| Want to fix resume-session cache breakage | `claude-code-cache-fix` wrapper |
| Just want a historical TTL split, no install | The Python script above |
| General token usage analysis | [ccusage](https://github.com/ryoppippi/ccusage) |

## Why This Method Is Reliable

It doesn't depend on any Anthropic public API, doesn't need admin access, doesn't wait for a billing statement — the source is local JSONL written by Claude Code to your disk, and the `cache_creation` object structure is part of Anthropic's API spec. Whatever the client does in its UI, this raw data **is the truth from the server**.

For anyone treating Claude Code as a production tool, this kind of self-instrumentation beats trusting Anthropic's changelog by a wide margin — especially since their March 6 change **had no changelog at all**.

## References

- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — main subject of this post; npm package providing both the fix and live TTL monitoring
- [How to Monitor Claude Code Cache Statistics — BSWEN](https://docs.bswen.com/blog/2026-04-01-monitor-cache-stats/) — earlier work on JSONL cache parsing
- [Followup: Anthropic quietly switched the default — r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1sk3m12/followup_anthropic_quietly_switched_the_default/)
- [Cache TTL silently regressed from 1h to 5m — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829)
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [Anthropic downgraded cache TTL on March 6th — Hacker News](https://news.ycombinator.com/item?id=47736476)
- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [ccusage — Claude Code Usage CLI](https://github.com/ryoppippi/ccusage)

