---
title: 'Does a Long Claude Code Session Waste Tokens? A Cost Model Most People Get Wrong'
description: 'Developers assume long Claude Code sessions waste tokens, so they /clear aggressively. But with prompt caching giving a 90% discount on reads, frequent clearing often costs more. Breaking down the three variables that actually drive cost.'
slug: claude-code-session-cost-cache-misconception
date: '2026-04-13T18:00:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- cost-optimization
draft: false
---

A common intuition among developers: Claude Code sessions get expensive over time. Context keeps accumulating, every turn resends the entire history, and token costs add up linearly. The obvious conclusion: `/clear` often, start fresh sessions for each task to save money.

That reasoning is **half right and half wrong**. The wrong half comes from leaving prompt caching out of the cost model. In practice, **frequent `/clear` can cost more than keeping a long session alive**.

## Cumulative Context Really Does Cost

Start with what's true. LLM APIs are stateless — every API call must resend the entire conversation history. After 10 turns with Claude, the 11th request contains all 10 previous turns plus your new question.

So yes, the input token count per call grows linearly as the session gets longer. It's reasonable to conclude "longer sessions cost more."

## But Prompt Caching Changes the Rules

Anthropic introduced prompt caching in 2024, and Claude Code enables it by default. The rule is simple: **identical prefixes only cost 10% of the normal price**.

Sonnet 4.6 pricing:

| Type | Price (per million tokens) | Relative |
|------|----------------------------|----------|
| Base input (uncached) | $3.00 | 100% |
| 5-minute cache write | $3.75 | 125% |
| 1-hour cache write | $6.00 | 200% |
| Cache read | **$0.30** | **10%** |

Opus is even more dramatic: base input $5, cache read only $0.50.

Meaning: the first time you send a large context block, it gets written to the cache and you pay a small write premium (25% above base). For the next 5 minutes, resending the same prefix costs 10% of base. The longer the session and the more cache hits accumulate, the lower your average per-token cost.

## The Three Variables That Actually Drive Cost

So the cost model isn't "context size × number of turns." It's these three factors:

### 1. Cache Hit Rate

In a long, continuous session, every turn's prefix hits the cache written by the previous turn. If a session has accumulated 50K tokens and turn 11 adds 2K new input:

- Without cache: 51K × $3 = $0.153
- With cache: 50K × $0.30 + 2K × $3 = $0.021

About a **7x difference**.

**What's worst about aggressive `/clear`**: every new session re-reads `CLAUDE.md`, re-learns your project files, re-warms the cache. These warm-up costs can easily exceed the "savings" from keeping context small.

### 2. Cache Invalidation

Cache requires **100% identical prefixes** to hit. These actions invalidate the whole cache:

- Editing any historical message
- Changing tool schemas (adding/removing MCP tools)
- Switching models (Sonnet ↔ Opus)
- Toggling web search or citations

Claude Code's auto-compact is also a cache-destruction event. The moment it squashes your 200K context into a summary, the accumulated cache is gone, and the next turn has to warm from scratch.

### 3. TTL (5 Minutes vs 1 Hour)

Default cache TTL is 5 minutes. Pause for more than 5 minutes and the cache expires — the next call pays full base input price.

Anthropic offers a 1-hour TTL option at 2x write cost ($6 vs $3) in exchange for longer persistence. Whether it's worth it depends on rhythm — bursty work with 10–30 minute gaps may benefit; continuous work never hits the timeout anyway.

## Counterintuitive: When Long Sessions Are Cheapest

Combine all three and you arrive at the opposite of "longer = more expensive":

**Long sessions are cheapest when**:

- Work is continuous, turns within 5 minutes of each other
- No editing of history, no model switches, no MCP churn
- Context stays below the compaction threshold (~155K safe zone)

**Short sessions / frequent clearing are costliest when**:

- Every new session re-reads large context (CLAUDE.md, multiple files, skill definitions)
- Every new session pays a "cache warm-up tax"
- You never reap the 10% cache-read discount

My own experience: two hours of continuous work in one session often costs less than splitting the same work into four independent 30-minute sessions — because the latter pays four cold starts.

## When Large Context **Is** Genuinely a Problem

None of this means context can grow forever with no consequence. Two thresholds turn "large context" from a cost problem into a **quality problem**:

**1. Approaching the context window limit** (Sonnet 200K / 1M, Opus 200K)

Model attention degrades past ~100K tokens, especially on content in the middle (the "lost in the middle" phenomenon). At this point the concern isn't cost — it's that the model **can't find or misuses** what you gave it earlier.

**2. Auto-compact triggers**

Claude Code auto-compacts as you approach the limit. Compaction is a major operation — cache fully invalidates, cost spikes, and the result is a summary with possible detail loss.

So context shouldn't grow unbounded, but the right reset trigger is "task complete" or "about to hit compaction," not "session has been open for X hours."

## Practical Recommendations

| Situation | Recommendation |
|-----------|----------------|
| Mid-task | Don't `/clear`, continue the session |
| Task done, starting a new one | `/clear` so the next session starts clean |
| Idle for >5 minutes | Use `/resume` instead of opening a new session (TTL expires but history is preserved) |
| Claude Code open often with idle gaps | Consider 1h TTL — 2x write cost but idle safety |
| Context exceeds 155K | Proactively end the session; don't wait for auto-compact |

To measure your actual cost, try [ccusage](https://github.com/ryoppippi/ccusage) or [claude-view](/en/2026/04/07/claude-view-mission-control/). A high share of `cache_read_input_tokens` means you're working efficiently; rising `cache_creation_input_tokens` with low reads means cache keeps invalidating — you're burning money.

"Longer sessions waste more tokens" is a stateless-era intuition, but prompt caching has been rewriting those rules for two years. Check how you actually use Claude Code — the token savings might surprise you.

## References

- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Manage Costs Effectively — Claude Code Docs](https://code.claude.com/docs/en/costs)
- [How Prompt Caching Actually Works in Claude Code — Claude Code Camp](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code)
- [How Context Compounding Works in Claude Code — MindStudio](https://www.mindstudio.ai/blog/claude-code-context-compounding-explained-2)
- [ccusage — Claude Code Token Usage CLI](https://github.com/ryoppippi/ccusage)
