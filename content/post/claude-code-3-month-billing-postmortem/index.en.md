---
title: 'I Audited 3 Months of Claude Code Billing — Most Community Cost-Saving Tips Don''t Work'
description: '$127K equivalent cost, 127K turns, four models, three months. After turning myself into a dataset, "long sessions are the culprit" and "too many skills" were debunked by data. Only two levers actually worked.'
slug: claude-code-3-month-billing-postmortem
date: '2026-04-26T07:55:00+08:00'
image: featured.png
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- cost-optimization
draft: false
---

This past week, chasing a vague "quota burns faster lately" feeling, I scanned three months of my own Claude Code logs. ~\$127K equivalent cost, 127K turns, four models, hundreds of sessions.

The uncomfortable finding: **the cost-saving tips floating around on Reddit / HN / Twitter mostly don't survive real data.** "Sessions are too long, run `/clear`," "too many skills, prune them," "MCP servers should be lean" — these all sound right. But against three months of actual data, **almost none holds up.** Only two things actually shrink the bill, and neither is about "optimizing your habits."

> Earlier I wrote [Scanned 95 days of Claude Code logs, found a second cache TTL silent regression]({{< ref "/post/claude-code-cache-ttl-audit" >}}) and [17-day follow-up]({{< ref "/post/claude-code-cache-ttl-17-days" >}}) covering server-side behavior. This post is the extension: with server behavior confirmed unfixable, what's left for the user side.

## Three Months of Bills

A single primary development project (one codebase, solo dev), monthly Claude Code totals:

| Month | Equiv \$ | Dominant Model | Key Event |
|-------|----------|----------------|-----------|
| 2026-02 | \$1,015 | Five models mixed | Trial period, low volume |
| 2026-03 | \$48,623 | **99.6% Opus 4.6** | Heavy usage starts; per-call prefix jumped 58K → 417K in one step |
| 2026-04 | \$77,754 | Opus 4.6 \$51K + Opus 4.7 \$25K | Opus 4.7 release on 4/16, alias auto-upgraded |

Two key observations:

1. **From March to April, Opus 4.6 cost barely changed** (\$48K → \$51K, +7%). \$/turn went from \$0.692 → \$0.713, a 3% delta. Usage habits stayed flat.
2. **The extra \$25K in April is almost entirely the Opus 4.7 layer.**

So the "lately it got expensive" feeling isn't because I changed anything — it's because **Opus 4.7 shipped on 4/16 and the `opus` alias automatically pointed to the new version.** With no version pinned in settings, the next session jumped to it.

> This is normal alias behavior, not something hidden. But for subscription users, the quota impact is real — as we'll see, the new version's adaptive thinking burns quota at 2.4× the old.

## Multi-Dimensional Breakdown for April

Here's the full cut by model for one month:

| Dimension | Opus 4.6 | Opus 4.7 | Sonnet 4.6 | Haiku |
|-----------|---------|---------|-----------|-------|
| **Volume** | | | | |
| Sessions (main/sub) | 24/138 | 18/84 | 5/46 | 1/376 |
| Total turns | 72,431 | 31,621 | 15,182 | 16,138 |
| % of total turns | 47.4% | 20.7% | 9.9% | 10.6% |
| Wall-clock hours | 635 | 270 | 72 | 14 |
| Active hours (no idle) | 237.9 | 106.5 | 40.2 | 6.2 |
| **Output Profile** | | | | |
| Turns/active hour | 305 | 297 | **378** | 2,614 |
| Tools/turn | 0.62 | 0.63 | 0.64 | 0.68 |
| Output tokens/turn | 227 | **667** | 456 | 101 |
| Sub:Main turn ratio | 1:1.32 | **1:15.56** | 1:14.95 | n/a |
| **Cost** | | | | |
| Equivalent \$ | \$51,700 | \$24,595 | \$773 | \$114 |
| Cost share | **67.0%** | 31.9% | 1.0% | 0.1% |
| Quota burn rate | 1.0× | **2.4×** | 0.2× | 0.05× |
| \$/turn | \$0.714 | \$0.778 | \$0.051 | \$0.007 |

Cross-column observations:

**Opus 4.7 emits 2.9× more output tokens per turn** (667 vs 227). It's not verbose — adaptive thinking's reasoning chain counts as output. To complete the same task, 4.7 burns roughly 3× the output of 4.6.

**Opus 4.7 doesn't delegate.** Sub:Main turn ratio jumped from 4.6's 1:1.32 to 1:15.56 — 4.6 is a "give half to sub-agents" collaborator, 4.7 is a "think it through alone" lone wolf. This explains the 3× output per turn: thinking is all done in-house.

**Sonnet 4.6 \$/turn is 1/16 of Opus.** But it only made up 9.9% of turns — clearly underused.

**Haiku is the invisible workhorse.** Zero main sessions, 376 sub-sessions, 16K turns for \$114 — all triggered automatically by Claude Code's built-in Explore / Plan agents. Untouched, still doing 10% of total turns.

## Five Common "Cost-Saving Tips" Debunked

Community lore (Reddit / HN / Discord) graded against real data.

### ❌ "Long sessions are the culprit"

The intuition: longer sessions mean longer conversation history, more cache prefix re-read per turn, more cost as the session drags on.

The data: March vs April Opus 4.6 usage is nearly identical (69,980 vs 72,510 turns), but \$/turn moved from \$0.692 → \$0.713, a 3% bump. If long sessions were the driver, **the per-turn cost should creep up month over month**. It doesn't.

More precisely: cache_read accounts for 77–88% of cost on both Opus versions. The number is huge, but the ratio **has been that way since heavy Claude Code usage started** — it's the inherent cost of "talking to an LLM," not the price of "not splitting sessions." `/clear` doesn't recover much.

### ❌ "Run `/clear` after 5+ min idle"

The intuition: 5-minute cache TTL means a brief idle expires the cache, so the next turn pays for a rewrite.

The data: my [second audit]({{< ref "/post/claude-code-cache-ttl-17-days" >}}) shows the main agent has been writing 100% to 1h TTL for 17 straight days since 4/9, with **zero 5m writes**. Idle a while and come back, cache is still there. No extra write cost.

The forced 5m downgrade only hits sub-agents (same post). But sub-agents only contributed a small slice of April's cost (~\$1,500 estimated), two orders of magnitude less than the \$25K from 4.7.

### ❌ "Too many skills"

The intuition: loaded skills inject metadata into the system prompt every turn.

The data: I actually measured. 40 skill descriptions add up to ~5–10K tokens. In a 425K per-call prefix, that's 1–2%. **Deleting all of them saves <\$1K/month** — not worth the effort.

### ❌ "Too many MCP servers"

The intuition: MCP tool definitions land in the prefix every turn.

The data: setup is 3–4 MCPs (pixel-mcp, the Google Workspace trio), several of which fail to connect and don't load. Already lean, nothing to trim.

### ❌ "CLAUDE.md is too long"

The intuition: CLAUDE.md gets re-read every turn.

The data: the project root CLAUDE.md is **1 byte** (essentially empty), the global one is 0 bytes. Zero impact.

> These five aren't wrong in every scenario. For someone with a 50K-token CLAUDE.md or 20 loaded MCP servers, they apply. But as **generic advice spread to everyone**, data shows they barely help a heavy single-project workflow.

## ✅ The Two Things That Actually Work

After the intuition reckoning, only two things hold up against the data:

### 1. Pin Specific Model Versions in settings.json

Don't use `opus` / `sonnet` aliases. When Anthropic ships a new version, the alias auto-points to it — invisible to the user but quota behavior shifts dramatically.

```json
{
  "model": "claude-opus-4-6",
  "permissions": { "...your existing..." }
}
```

This way when opus-4.8 / 4.9 ships, you don't auto-follow. New versions **aren't always more economical** — for 4.6 vs 4.7:

- \$/turn +9%
- Output/turn +190%
- Quota burn +140%
- Turns to complete same work only −12%

Net CP value is 1.9× higher on 4.6. Every model release, check [cnighswonger's advisory](https://github.com/cnighswonger/claude-code-cache-fix) and run your own data for a while before deciding to upgrade.

### 2. Route Review / Fix / Test to Sonnet

The \$/turn gap is real (Opus \$0.71 vs Sonnet \$0.045 — 16×). My April: 14K turns on Sonnet for \$643, same turns on Opus 4.6 would have been \$10K.

Switch to Sonnet for:

- Code review, reading PR diffs
- Small bug fixes, type annotations, null checks
- Writing tests, adding test cases
- Docs, commit messages, changelogs
- Renames, simple refactors

Stay on Opus for:

- Cross-file architectural rewrites
- Design decisions needing long reasoning chains
- Complex debugging (race conditions, memory leaks)
- Exploring an unfamiliar codebase the first time

How: inside a session, `/model claude-sonnet-4-6` to switch over for a few rounds, then `/model claude-opus-4-6` to switch back. **Don't lock Sonnet in settings** — you'll forget to switch when you need Opus.

## Real Magnitudes

If both levers are in place, expected April-baseline change (against \$77K):

| Action | Expected Savings | % of Monthly Bill |
|--------|------------------|-------------------|
| Pin 4.6 (cancel 4.7 auto-follow) | \$25K/mo | 32% |
| Route review/fix/test to Sonnet (expand to 30% of turns) | \$10–15K/mo | 13–20% |
| **Total** | **\$35–40K/mo** | **45–52%** |

The remaining 50% is the inherent cost of "heavy Opus 4.6 usage on a primary project" — not optimizable, and shouldn't be. That's the work itself.

## Lessons

The biggest takeaway from turning myself into a dataset isn't the savings — it's seeing **how unreliable community intuition is**.

"Shorter session = cheaper," "fewer skills = cleaner" might hold in some scenarios, but **for single-project heavy-use workflows they're flat wrong**. Without breaking cost down to model × session × turn, I'd never have spotted that "the Opus 4.7 alias upgrade" is the single biggest reason April got expensive.

Broader lessons:

1. **Floating optimization tips are noise** — without data, "cost-saving advice" often optimizes the wrong thing
2. **Aliases hand cost control to the vendor** — the mechanism isn't bad, but it's a real risk for subscription users with quota planning
3. **Multi-model strategy beats single-model tuning** — same dollar, Sonnet does 16× the turn volume

If you want to scan your own, the 60-line Python from [the first post]({{< ref "/post/claude-code-cache-ttl-audit" >}}) is reusable — adjust the cost calc and you'll get this analysis for your data. Make yourself a dataset and re-check what the community thinks it knows.

[Background: Claude Code session cost & cache misconception]({{< ref "/post/claude-code-session-cost-cache-misconception" >}})

## References

- [Cache TTL silently regressed — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829)
- [Subagent trailing block missing cache_control — Issue #50213](https://github.com/anthropics/claude-code/issues/50213)
- [Widespread quota drain since 2026-03-23 — Issue #41930](https://github.com/anthropics/claude-code/issues/41930)
- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — Opus 4.7 quota burn advisory + cache fix proxy
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
