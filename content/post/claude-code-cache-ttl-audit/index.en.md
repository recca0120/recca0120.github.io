---
title: 'I Scanned 95 Days of My Claude Code Logs and Found Anthropic''s Second Silent Cache TTL Regression'
description: 'The community is angry about Anthropic''s March 6 silent TTL change, but billing statements aren''t enough proof. I scanned 95 days of my own Claude Code native logs, precisely reproduced the March 6 regression, and uncovered a second wave starting April 9 — sub-agents 100% downgraded to 5m TTL, never publicly reported.'
slug: claude-code-cache-ttl-audit
date: '2026-04-14T03:00:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- python
draft: false
---

[The previous post](/en/2026/04/13/claude-code-session-cost-cache-misconception/) covered prompt caching cost mechanics. While researching it I bumped into a dramatic controversy — in March 2026 Anthropic **silently changed Claude Code's cache TTL from 1 hour back to 5 minutes**, with community-measured monthly costs inflating 15–53%. Reddit and HN exploded.

But every public claim is somebody else's billing statement or [issue #46829](https://github.com/anthropics/claude-code/issues/46829). I wanted to know whether **my own machine** was affected. After scanning 95 days of native logs, the answer turned out richer than expected: I not only reproduced the March 6 regression precisely, but also discovered **a second wave starting April 9** — five consecutive days, 4,840 API calls, sub-agents 100% downgraded to 5m, and no public report I can find.

## The Evidence Is in ~/.claude/projects JSONL

Claude Code writes complete API interaction logs at:

```
~/.claude/projects/{project-path}/{session-uuid}.jsonl
```

Each assistant response carries a `usage.cache_creation` object that **directly tells you which TTL bucket this write went to**:

```json
{
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 6561
  }
}
```

These fields come **straight from Anthropic's API**, bypassing any client-side display logic. If the client wanted to lie, the server wouldn't go along — this data is the truth from the server itself.

A Python script that scans every project, splits by date, and separates main agent from sub-agent:

```python
#!/usr/bin/env python3
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path.home() / ".claude/projects"
main = defaultdict(lambda: {"5m":0,"1h":0,"calls":0})
sub  = defaultdict(lambda: {"5m":0,"1h":0,"calls":0})

for jsonl in ROOT.rglob("*.jsonl"):
    bucket = sub if "subagent" in jsonl.parent.name.lower() else main
    try:
        with jsonl.open() as fp:
            for line in fp:
                try: d=json.loads(line)
                except: continue
                ts=d.get("timestamp"); msg=d.get("message")
                if not isinstance(msg,dict) or not ts: continue
                u=msg.get("usage") or {}; cc=u.get("cache_creation") or {}
                w5=cc.get("ephemeral_5m_input_tokens",0)
                w1=cc.get("ephemeral_1h_input_tokens",0)
                if not (w5 or w1): continue
                day=ts[:10]
                bucket[day]["5m"]+=w5
                bucket[day]["1h"]+=w1
                bucket[day]["calls"]+=1
    except: pass

def pct(s):
    tot=s["5m"]+s["1h"]
    return s["1h"]/tot*100 if tot else 0

print(f"{'Date':<11} | {'M5m':>10} {'M1h':>11} {'M%':>4} | {'S5m':>11} {'S1h':>12} {'S%':>4} {'calls':>5}")
for d in sorted(set(main.keys())|set(sub.keys())):
    if d < '2026-01-01': continue
    m=main[d]; s=sub[d]
    print(f"{d} | {m['5m']:>10,} {m['1h']:>11,} {pct(m):>3.0f}% | "
          f"{s['5m']:>11,} {s['1h']:>12,} {pct(s):>3.0f}% {s['calls']:>5}")
```

## 95-Day Timeline

Scanning my machine from January 9 through April 13, **four phases with three transitions emerge**:

| Phase | Window | Sub-agent | Main agent | Event |
|-------|--------|-----------|-----------|-------|
| 1 | 1/9 ~ 2/5 | **100% 5m** (28 days) | no data | 1h not yet rolled out |
| 2 | **2/6** | 79% 1h (transition starts) | — | **The 2/1-announced 1h upgrade actually goes live** |
| 3 | 2/7 ~ 3/5 | **100% 1h** stable (28 days) | 100% 1h | 1h golden era |
| 4 | **3/6** ~ 4/8 | 1h ↔ 5m mixed, swinging 6%–97% | 100% 1h | **First regression** (the one cnighswonger reported) |
| 5 | **4/9** ~ now | **100% 5m** stable (5 days) | 100% 1h | **Second regression** (no public report) |

Key days around each transition:

```
Date        | MAIN 1h  calls | SUB 5m         SUB 1h         S1h%   calls
------------|----------------|-----------------------------------------
2026-02-05  | (no data)      |          0    7,974,898       100%   1392    ← still 1h
2026-02-06  | (no data)      |  2,886,030   10,753,834        79%   1684    ← 1h rollout begins
2026-02-07  | (no data)      |          0    4,280,317       100%    639

2026-03-05  | 100%   1503    |          0    6,004,235       100%   2446    ← still 1h
2026-03-06  | 100%   3355    |    461,509    1,281,686        74%    608    ← FIRST regression!
2026-03-07  | 100%   2753    |  9,810,771   10,465,251        52%   7548
2026-03-08  | 100%   4724    | 34,340,003   24,301,557        41%  17514

2026-04-08  | 100%   3041    |  2,650,760    5,533,277        68%   1301    ← still mixed
2026-04-09  | 100%   4155    |  8,451,674            0         0%   1268    ← SECOND regression!
2026-04-10  | 100%   5523    |  5,437,455            0         0%   1170
2026-04-11  | 100%   2579    |  3,325,195            0         0%    778
2026-04-12  | 100%   3738    |  2,981,213            0         0%    993
2026-04-13  | 100%   4443    |  2,648,132            0         0%    631
```

## Decoding the Three Transitions

### Transition 1: 2026-02-06 — 1h Rollout Goes Live

Anthropic announced "TTL upgraded from 5m to 1h" on 2/1. **The actual rollout landed on 2/6.** My logs show sub-agent flipping from 100% 5m to 79% 1h overnight, matching the announcement.

### Transition 2: 2026-03-06 — [First Silent Regression](https://github.com/anthropics/claude-code/issues/46829)

This is the event [cnighswonger reported in issue #46829](https://github.com/anthropics/claude-code/issues/46829), using the same methodology to scan 119,866 API calls — **on March 6, sub-agent went from 100% 1h to 74%**. I reproduced it precisely: 3/5 still 100% 1h, 3/6 dropped to 74%, 3/7 spiked to 9.8M tokens of 5m writes.

The following month (3/6–4/8), sub-agent oscillated wildly between 6% and 97% 1h share. The server's TTL decision **logic was unstable**.

Anthropic employee Jarred Sumner defended in [The Register's coverage](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/) that "sub-agent 5m is cheaper for one-shot calls" — barely plausible for the mixed phase 4 behavior. But the next event breaks that defense.

### Transition 3: 2026-04-09 — Second Silent Regression (Original Finding)

**Starting 4/9, sub-agent 1h share dropped to zero.** Five consecutive days, 100% 5m, across **4,840 API calls**. No public report I can find.

Why this matters:

**Not noise.** 4,840 calls with zero 1h, while 4/8 was still 68% 1h. This is a **sharp binary cutover**, not gradual drift.

**Not a quota-triggered downgrade.** Anthropic's docs say exceeding 5h quota triggers a server-enforced downgrade. But **main agent is 100% 1h on the same days** — quota mechanism would have downgraded both.

**Not a client version issue.** Same client, same day, two different TTL behaviors for main vs sub.

**Not a workflow change.** API call volume sits in the normal range (631–1268 per day), comparable to early April.

**The only plausible explanation: starting 4/9, the server changed sub-agent default TTL from "mixed" to "hard-coded 5m".** And **no changelog, no announcement, no issue mentions it** — the same silent-rollout pattern as 3/6.

## Why Main Agent Was Never Affected

Across all 95 days, main agent has zero 5m writes. Every TTL action Anthropic took **only touched sub-agents**:

| Claim | Did my data verify it |
|-------|----------------------|
| Reddit "Anthropic silently changed TTL on 3/6" | ✅ **Strongly verified** (precise 3/6 transition) |
| Sumner "main agent unaffected" | ✅ **Verified** (main 100% 1h across 95 days) |
| "Regression only hits sub-agent" | ✅ **Verified** |
| Sumner "sub-agent 5m is a one-shot optimization" | ⚠️ **Partially refuted** (4/9 100% 5m isn't optimization, it's forced downgrade) |
| **New finding: 4/9 sub-agent 100% 5m** | 🆕 **Original** |

## Anyone Can Reproduce This

Save the script above as `~/bin/cc-ttl-timeline.py` and run:

```bash
python3 ~/bin/cc-ttl-timeline.py
```

If you see corresponding 3/6 and 4/9 transitions in your sub-agent — you're a silent regression victim, please add a data point to issue #46829. If you don't see them — the regression isn't a 100% rollout and you're in the control group.

Both outcomes have value. **The point is this evidence chain doesn't depend on anyone's claims** — the source is local JSONL written by Claude Code to your disk, and the `cache_creation` object structure is part of Anthropic's public API spec. To fake this the server would have to lie in its own API responses.

## Why Not Just Use cnighswonger's npm Package

[cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) is excellent, but it **only sees data captured after install** — its monitoring tools (status line, cost-report, quota-analysis) read `~/.claude/usage.jsonl`, which only exists while the interceptor is loaded.

For **historical** audit, only Claude Code's own `~/.claude/projects/*.jsonl` works. That's what this post uses.

The two are complementary:

| Scenario | Tool |
|----------|------|
| Look back, find regression transition dates | **The Python script in this post** |
| Live TTL state visibility + fix client cache bugs | cnighswonger's package |
| General token usage analysis | [ccusage](https://github.com/ryoppippi/ccusage) |

## Closing

"Did Anthropic silently change cache TTL?" — everyone should scan their own data. Community rumors and Anthropic's official statements aren't enough. Only the JSONL on your disk doesn't lie.

The result is valuable either way: see the regression → you're a victim, contribute evidence; don't see it → you're in the control group, which is also evidence that the rollout isn't 100%.

I'll keep scanning every few days to see how long the 4/9 wave persists and whether it spreads to main agents. If your data shows similar 100% 5m sub-agent behavior post-4/9, please comment on [issue #46829](https://github.com/anthropics/claude-code/issues/46829) or reach out.

## References

- [Cache TTL silently regressed from 1h to 5m — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829) — cnighswonger's original evidence
- [Followup: Anthropic quietly switched the default — r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1sk3m12/followup_anthropic_quietly_switched_the_default/)
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [Anthropic downgraded cache TTL on March 6th — Hacker News](https://news.ycombinator.com/item?id=47736476)
- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — fixes client cache-busting bugs + live monitor
- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [ccusage — Claude Code Usage CLI](https://github.com/ryoppippi/ccusage)
