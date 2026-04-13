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

## What "Prefix" Actually Means

Before going further, it's worth unpacking the word "prefix." A prompt is an ordered sequence of tokens. Cache matching runs **from the very beginning, token by token** — and a single differing token breaks everything after it.

In multi-turn conversations, every new turn **only appends to the tail**; the prior history stays untouched:

```
Turn 1: [system] [CLAUDE.md] [Q1]
Turn 2: [system] [CLAUDE.md] [Q1] [A1] [Q2]
         ↑ identical prefix → cache hit at 10% price
                                    ↑ new tail → written to cache
Turn 3: [system] [CLAUDE.md] [Q1] [A1] [Q2] [A2] [Q3]
         ↑ an even longer prefix hits cache
```

So long conversations **aren't a cost disadvantage — they're an advantage**. The longer the accumulated history, the more tokens per turn get the 90% discount.

But this only holds while you're strictly appending. If you could go back and edit Turn 5, every token after Turn 5 — even ones that look identical — invalidates because the prefix hash diverges from that point onward. That's the cruelty of "prefix": change one character in the middle and everything downstream is lost.

Analogy: git commit hashes. Tweak any historical commit and every hash after it changes.

## Topic Switching: How Cache Bills Across A → B → C

The most-overlooked scenario: you discuss topic A with Claude, finish, move to topic B, then topic C — **without `/clear` in between**. A's and B's histories stay glued to the prompt prefix, getting billed at 10% on every single turn while they ride along.

Concretely:

```
Topic A (30K tokens accumulated over 10 turns)
  → A's 30K written to cache

Switch to B (no /clear)
  Turn 11 = [A's 30K] + [B's new question]
            ↑ 30K × $0.30/M = $0.009 from cache

B accumulates 20K more

Switch to C (still no /clear)
  Every turn = [A's 30K] + [B's 20K] + [C's new question]
               ↑ 50K from cache ≈ $0.015 / turn
```

20 turns on C means an extra 20 × $0.015 = $0.30 spent "carrying corpses." A and B may contribute nothing to C, but you're paying for them to ride along.

**Rule of thumb for when to `/clear`**:

- **A, B, C are independent** (frontend in the morning / SQL in the afternoon / CI at night) → `/clear` between topics
- **A, B, C reference each other** (A defines spec / B implements / C debugs B) → don't clear; the 10% price on history is cheap and useful
- **History is heavy but its conclusion is condensable** (A was a 50K doc you read) → clear, then paste a short summary of A's conclusions as new context

A common misconception: "Claude Code automatically detects topic changes and drops stale content." **It doesn't.** Cache is mechanical prefix matching — it has no semantic understanding. Deciding what to forget is **entirely a human responsibility**: either `/clear` manually, or let auto-compact fire based on context usage (not topic).

## The Three Variables That Actually Drive Cost

So the cost model isn't "context size × number of turns." It's these three factors:

### 1. Cache Hit Rate

In a long, continuous session, every turn's prefix hits the cache written by the previous turn. If a session has accumulated 50K tokens and turn 11 adds 2K new input:

- Without cache: 51K × $3 = $0.153
- With cache: 50K × $0.30 + 2K × $3 = $0.021

About a **7x difference**.

**What's worst about aggressive `/clear`**: every new session re-reads `CLAUDE.md`, re-learns your project files, re-warms the cache. These warm-up costs can easily exceed the "savings" from keeping context small.

### 2. Cache Invalidation

Cache requires **100% identical prefixes** to hit. These actions invalidate it — some loudly, some quietly:

| Event | Impact |
|-------|--------|
| Editing message N | Everything from N onward invalidates (earlier still cached) |
| Adding/removing an MCP tool | Full invalidation (tool schemas sit at the front) |
| Switching Sonnet ↔ Opus | Different model, different cache — starts over |
| Toggling web search / citations | system + message cache invalidates |
| Idle > 5 minutes (TTL expires) | Cache evaporates; next call pays 100% to rewrite |
| Auto-compact fires | Prefix is replaced by a summary; subsequent turns warm a fresh cache |
| `/clear` | Everything resets |

Idle-over-5-minutes is the sneakiest — grab lunch, come back, type a question, and you've quietly paid full write price without any UI warning.

A nuance about auto-compact worth clarifying: per Anthropic's implementation, the **compaction API call itself** sends the same prefix as the turn before it, so that call is a cache hit. The real cost lands **after** compaction — the new session uses the summary in place of the original history as its prefix, so every subsequent turn is warming a brand-new cache from that point on. The net cost is similar to "cache blown away," but the mechanism is prefix replacement, not cache invalidation.

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
