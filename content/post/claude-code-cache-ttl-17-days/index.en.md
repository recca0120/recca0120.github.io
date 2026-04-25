---
title: '12 More Days Scanned: Claude Code Sub-Agent Cache TTL Has Been 100% 5m for 17 Straight Days — This Isn''t a Regression, It''s the New Default'
description: 'On 4/14 I reported 5 days of sub-agent 100% 5m and left it at "monitoring." Today 4/26 it''s 17 straight days, 15,727 API calls, 0 1h writes. Anthropic closed the main issue without resolution. The community is on fire.'
slug: claude-code-cache-ttl-17-days
date: '2026-04-26T05:55:00+08:00'
image: featured.png
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- python
draft: false
---

[Two weeks ago]({{< ref "/post/claude-code-cache-ttl-audit" >}}) I scanned 95 days of Claude Code logs and found that since 4/9, sub-agents had been 100% downgraded to 5m TTL — 5 consecutive days, 4,840 API calls, with the main agent completely untouched. I left the conclusion at "monitoring," since 5 days could still be rollout flapping.

Today 4/26, I re-ran the same Python. The streak is now **17 days**, **15,727 API calls, 0 1h writes**. This isn't flapping — Anthropic's server has quietly **hard-coded the sub-agent default TTL to 5m**. No changelog, no announcement, and the main issue was just closed without resolution.

This is a follow-up: latest data, cost math, community and media state, and why cnighswonger's proxy can't save you here either.

## Past Two Weeks of Data

Scan covers 4/13–4/25 (cut-off of last post → today):

| Metric | Main agent | Sub-agent |
|--------|-----------|-----------|
| Total API calls | 60,291 | 15,727 |
| 1h writes | **100%** (150.7M tokens) | **0** |
| 5m writes | 0 | **100%** (60.4M tokens) |
| Consecutive 1h-write days | 13 | 0 |
| Consecutive 5m-write days | 0 | 13 |

Add the 4/9–4/12 stretch and **the sub-agent has run 17 straight days at 100% 5m, with 0 1h writes**. Sub-agent workload didn't drop — 4/14 (the day I posted last) hit 2,648 calls, 4/17 spiked to 2,821, both two-week highs. The full cost impact landed on me.

Key contrast: **the main agent stayed 100% 1h the entire time, untouched**. So this is unambiguously server-side discrimination against the "sub-agent identity" — not quota throttling, not a client version, not a workflow change.

## How Much More Expensive: The Math

Anthropic's official cache pricing:

- Cache write to 5m TTL: **1.25× base input price**
- Cache write to 1h TTL: **2× base input price**
- Cache read (both): **0.1× base input price**

Intuition says 5m writes are cheaper — 1.25× vs 2×, a 37.5% saving. But sub-agent workflows defeat that intuition.

A typical sub-agent runs 30 minutes, 5 turns. Between turns it waits for the LLM to think, runs tools, parses results. **3 inter-turn gaps over 5 minutes** is normal. Each gap past TTL expires the cache and forces a rewrite next turn.

Total cost (with base input as 1×):

```
Old (1h TTL):
  1 cache write @ 2×  = 2.0
  4 cache reads @ 0.1× = 0.4
  Total = 2.4×

New (5m TTL):
  4 cache writes @ 1.25× = 5.0
  1 cache read   @ 0.1× = 0.1
  Total = 5.1×
```

**About 2.1×**. A heavy sub-agent workflow (parallel Task fan-out, long plan-execute, code-review pipelines) that used to cost \$10 now costs \$21.

> This assumes inter-turn gaps average over 5m. If your sub-agent finishes every turn within 5m (e.g. pure retrieval), the impact is much smaller. The hardest-hit are sub-agents that "run long, wait for tool results."

## GitHub Activity Past Week

### Issue #46829: Closed by Anthropic

cnighswonger's [#46829](https://github.com/anthropics/claude-code/issues/46829) was **closed by Anthropic without a fix**. Comments are uniformly angry:

- **DaQue**: "I don't like the stealth nerf."
- **rinchen**: "Yet another issue closed without resolution by Anthropic."
- **lizthegrey** (Engineering Director at Honeycomb, jumped in 4/25): posted her own grep one-liner, listed her affected versions and dates (4/01 v2.1.81, 4/09 v2.1.85, 4/13–4/17 v2.1.92, 4/21 v2.1.114), and explicitly stated she **provided redacted jsonl transcripts to Anthropic**. The most credible piece of evidence submitted so far.

```bash
# lizthegrey's one-liner
grep -h -r -E 'ephemeral_.*_input_tokens' ~/.claude | \
  jq 'select(.isSidechain == false and (.message.model | startswith("claude-haiku") | not) and .message.usage.cache_creation.ephemeral_5m_input_tokens > 0) | .timestamp + "," + .version' 2>/dev/null | \
  sed 's/T.*,/,/' | sort | uniq -c
```

Same data source as my 60-line Python from the last post, just more concise. Drop-in usable.

### Issue #50213: Sub-agent Trailing Block Missing cache_control

ofekron added measurements on [#50213](https://github.com/anthropics/claude-code/issues/50213) on 4/17: every built-in sub-agent (Explore, Plan, general-purpose) shows nonzero `cache_creation` on second spawn — the trailing system-context block has no cache_control marker, so each fresh spawn wastes ~4.7K tokens rewriting. **0 new comments past week** — this issue is being ignored.

Together the two issues say the same thing: **Anthropic's posture toward sub-agent cache leans toward "save where we can," not "optimize where we can."**

### No Movement from Anthropic Staff

- **bcherny**'s earlier mention of a "per-request env var / flag for TTL" — **still not shipped**
- **Jarred Sumner**'s earlier defense in The Register that "sub-agent 5m is a one-shot optimization" — **no response to the 4/9 100% 5m data**
- Anthropic posted nothing on these issues in the past week

## Media Coverage and a Bigger Thread

This isn't just blowing up on GitHub:

- **The Register (4/13)**: [Anthropic: Claude quota drain not caused by cache tweaks](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/) — Anthropic publicly denies a cache link, with Sumner's defense quoted in full
- **XDA Developers**: [Anthropic quietly nerfed Claude Code's 1-hour cache](https://www.xda-developers.com/anthropic-quietly-nerfed-claude-code-hour-cache-token-budget/)
- **DevOps.com**: [Developers Using Anthropic Claude Code Hit by Token Drain Crisis](https://devops.com/claude-code-quota-limits-usage-problems/)

Worth tracking: [Issue #41930](https://github.com/anthropics/claude-code/issues/41930) — **since 3/23 every paid tier has been hit by abnormal quota burn**, Pro / Max 5× / Max 20× included. Single prompts eat 3–7% of session quota; 5h windows drain in as little as 19 minutes. The community treats cache TTL regression, autocompact cascades, and sub-agent fan-out as **stacked root causes**. My 4/9 second-wave finding fills in the timeline of "sub-agent specifically got worse again on 4/9."

## Can cnighswonger's Proxy Save This? My Take

[cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) v3.0.3 has nice A/B numbers on CC v2.1.117: through the proxy **95.5% cache hit rate**, direct **82.3%**. It runs 7 hot-reloadable extensions, including `ttl-management`, which "detects server TTL tier and injects correct cache_control markers."

But for the "server force-writes sub-agent into 5m" problem, **the proxy probably can't save you**. My read:

- The proxy fixes **"caches that should hit but miss because of client bugs"** (unstable fingerprint, non-deterministic tool ordering, inconsistent cache_control markers)
- It can't fix **"client marks 1h, server still writes 5m"** — that's server-side behavior, the proxy can't rewrite responses
- From our 17 days of 100% 5m / 0 1h writes, the server is doing the latter for sub-agents

Easy to verify: install the proxy, run the same script against `~/.claude/projects/*.jsonl`, see if sub-agent `ephemeral_1h_input_tokens` ever goes from 0 to nonzero. If it stays 0, the server-side change is confirmed.

> This isn't a knock on cnighswonger's proxy — it has demonstrated value for the main agent and any cache-miss scenario. Just don't expect it to "bring back sub-agent 1h TTL."

## Conclusion: This Is the New Default

In the 4/14 post I called the 4/9 wave "a second silent regression." On 4/26 I'm revising the wording: **this is no longer a regression — it's Anthropic's new default for sub-agents.**

Evidence weight:

- **17 consecutive days** (4/9–4/25)
- **15,727 API calls** in just the past 13 days
- **0 1h writes** (not low — actually zero)
- **Main agent untouched** (clear differential treatment)
- **Media + GitHub + community on fire**, Anthropic stays silent

If you lean heavily on sub-agents:

1. **Scan your own data first** — use the Python from the last post, or lizthegrey's jq one-liner above
2. **Calculate the actual cost impact** — it's not "a bit more," it's about 2×
3. **Re-evaluate your sub-agent workflows** — anything doable in the main agent shouldn't fan out to sub-agents
4. **Drop a data point on [issue #46829](https://github.com/anthropics/claude-code/issues/46829)** — closed but still indexed. With Honeycomb-tier voices already pushing, more data makes external coverage easier to follow up

[Background — Claude Code session cost & cache misconception]({{< ref "/post/claude-code-session-cost-cache-misconception" >}}) covers the cache cost logic. [First audit]({{< ref "/post/claude-code-cache-ttl-audit" >}}) covers how to scan your own logs to verify. Read both for the full picture.

## References

- [Cache TTL silently regressed — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829) — closed, community still commenting
- [Subagent trailing block missing cache_control — Issue #50213](https://github.com/anthropics/claude-code/issues/50213)
- [Widespread quota drain since 2026-03-23 — Issue #41930](https://github.com/anthropics/claude-code/issues/41930) — parent issue with stacked root causes
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [Anthropic quietly nerfed Claude Code's 1-hour cache — XDA Developers](https://www.xda-developers.com/anthropic-quietly-nerfed-claude-code-hour-cache-token-budget/)
- [Developers Hit by Token Drain Crisis — DevOps.com](https://devops.com/claude-code-quota-limits-usage-problems/)
- [The 5-Minute TTL Change That's Costing You Money — dev.to](https://dev.to/whoffagents/claude-prompt-caching-in-2026-the-5-minute-ttl-change-thats-costing-you-money-4363)
- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — proxy + extension package
