---
title: 'How to Add Old Models to Claude Code /model Picker: 3 Methods Tested'
description: 'After Opus 4.7 auto-upgrade, the old version vanished from /model. Tested availableModels, modelOverrides, and ANTHROPIC_CUSTOM_MODEL_OPTION — with pitfalls and GitHub community discussion.'
slug: claude-code-model-picker-config
date: '2026-04-27T01:07:00+08:00'
image: featured.png
categories:
- AI
tags:
- claude-code
- cost-optimization
draft: false
---

The day Opus 4.7 launched, Claude Code's `opus` alias silently pointed to the new version. No notification, no changelog reminder. Open the `/model` picker — Opus 4.6 was gone.

I'd previously written a [3-month billing analysis]({{< ref "/post/claude-code-3-month-billing-postmortem" >}}) showing 4.7's quota burn is 2.4× that of 4.6. Switching back seemed obvious, but the picker had no option for it. I spent an afternoon testing every configuration method and combing through GitHub issues.

## Three Configuration Mechanisms

Claude Code currently offers three ways to modify the `/model` picker.

### 1. `availableModels`: Replaces, Doesn't Extend

Add this to `~/.claude/settings.json`:

```json
{
  "availableModels": [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5"
  ]
}
```

The `/model` picker now shows **only these three**. The default opus / sonnet / haiku aliases all disappear, replaced entirely by your list.

This is the biggest gotcha: many people assume `availableModels` means "add these on top of the defaults." It doesn't — it's a complete replacement.

### 2. `modelOverrides`: For Bedrock / Vertex

```json
{
  "modelOverrides": {
    "claude-opus-4-7": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-opus-4-7-v1:0"
  }
}
```

This maps model IDs to provider-specific endpoints. If you're using the Anthropic API directly, this setting does nothing for you.

### 3. `ANTHROPIC_CUSTOM_MODEL_OPTION`: One Extra, That's It

Supported since v2.1.78, this environment variable adds a single custom entry to the bottom of the `/model` picker:

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="claude-opus-4-6[1m]"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="Opus 4.6 (1M)"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="Opus 4.6 with 1M context window"
```

It doesn't touch the default picker, but **you can only add one**. Want both Opus 4.6 and Sonnet 4.6 1M? No luck — there's no `ANTHROPIC_CUSTOM_MODEL_OPTION_2`.

## Pitfalls

### Aliases Don't Work in availableModels

You might try:

```json
{
  "availableModels": ["opus", "sonnet", "haiku", "claude-opus-4-6[1m]"]
}
```

The picker shows 4 items, but `opus`, `sonnet`, `haiku` behave inconsistently when mixed with full model IDs. Aliases aren't valid model IDs in this context — stick to full IDs.

### Same-Family Deduplication

If you list both `claude-opus-4-6` and `claude-opus-4-7` in `availableModels`, same-family deduplication may collapse them into one entry. This behavior is undocumented.

### Lock Version with `model`, Not `availableModels`

`availableModels` controls what's in the picker. The `model` field controls what's actually used at startup:

```json
{
  "model": "claude-opus-4-6[1m]",
  "availableModels": ["claude-opus-4-6[1m]", "claude-sonnet-4-6", "claude-haiku-4-5"]
}
```

Set both. If you only set `availableModels` without `model`, startup still uses whatever the default alias points to.

## What the GitHub Community Says

This isn't a niche issue. There are plenty of related issues on GitHub:

### [#14443](https://github.com/anthropics/claude-code/issues/14443) — Request for Configurable Model Picker

User joerivwijn asked for the `/model` picker to be configurable via settings.json. Especially relevant for Bedrock users whose model IDs need `us.` prefixes and `:0` suffixes that don't match the default picker.

**Result:** Marked as duplicate of #12969 by bot and auto-closed.

### [#12738](https://github.com/anthropics/claude-code/issues/12738) — Opus 4.5 Disappeared from Picker

User grigb reported Opus 4.5 missing from the CLI picker on the Max plan, despite being available in the web app. Multiple users confirmed:

- **cleanspin** found `/model opus` pointed to Opus 4.1 instead of 4.5 — the alias mapping was stale. Workaround: use the full ID `/model claude-opus-4-5-20251101`
- **todddrinkwater** reported the VS Code extension also affected
- **zerzerzerz** and **PavelProdan** posted screenshots confirming "it was there yesterday, gone today"

This pattern repeats with every new model release: the alias points to the new version, the old version vanishes from the picker, no notice given.

**Result:** Auto-closed by stale bot.

### [#35630](https://github.com/anthropics/claude-code/issues/35630) — ANTHROPIC_CUSTOM_MODEL_OPTION Undocumented

User coygeek noticed v2.1.78's changelog mentioned this env var, but official docs had zero coverage.

**Result:** Fixed — both the env-vars and model-config doc pages now include full documentation.

### Other Related Open Issues

| Issue | Problem |
|---|---|
| [#52310](https://github.com/anthropics/claude-code/issues/52310) | Bedrock ignores `availableModels`, shows only one model per family |
| [#47164](https://github.com/anthropics/claude-code/issues/47164) | Enterprise custom model IDs can't appear in interactive picker |
| [#40501](https://github.com/anthropics/claude-code/issues/40501) | Duplicate entries when settings.json model matches a built-in option |
| [#49566](https://github.com/anthropics/claude-code/issues/49566) | `ANTHROPIC_DEFAULT_*_MODEL` creates duplicate "Custom" entry on Bedrock |
| [#53006](https://github.com/anthropics/claude-code/issues/53006) | VS Code extension missing Sonnet 4.6 |
| [#38238](https://github.com/anthropics/claude-code/issues/38238) | 1M context model not available in picker on WSL2 |

The issues cluster around two themes: **stale alias mappings** and **no mechanism to extend the default list**.

## Recommended Configuration

After testing everything, `availableModels` is unreliable due to same-family deduplication — list 4 models and you might only see 3. The most practical approach: **don't touch `availableModels`, keep the default picker, lock your version with `model`, and add one extra option with `ANTHROPIC_CUSTOM_MODEL_OPTION`.**

**`~/.claude/settings.json`** (global):

```json
{
  "model": "claude-opus-4-6[1m]"
}
```

One line. The default picker stays intact (opus / sonnet / haiku all present), but every session starts on Opus 4.6 1M. The `opus` alias in the picker points to the latest version (currently 4.7), so you can switch to it anytime.

**`~/.zshrc`** (add a 4th option via `ANTHROPIC_CUSTOM_MODEL_OPTION`):

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="claude-sonnet-4-6[1m]"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="Sonnet 4.6 (1M)"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="Sonnet 4.6 with 1M context window"
```

This gives 4 options in `/model`: the default opus / sonnet / haiku, plus Sonnet 4.6 1M. Covers all daily scenarios:

- **Opus 4.6 1M**: locked via `model` field, used on startup
- **Opus 4.7**: the `opus` alias in the picker, switch when needed
- **Sonnet 4.6**: the `sonnet` alias, for review / fix / test tasks
- **Sonnet 4.6 1M**: the 4th option via env var, for large context scenarios

> Why not use `availableModels`? It's a full replacement, and same-family dedup silently eats entries. Leaving it unset gives you the most stable default picker.

## Conclusion

Claude Code's model picker assumes everyone wants the latest version. `availableModels` is a full replacement with dedup issues; `ANTHROPIC_CUSTOM_MODEL_OPTION` only supports one entry.

In practice, `model` + `ANTHROPIC_CUSTOM_MODEL_OPTION` covers most needs: lock your version with `model`, add one extra option via env var, and leave the default picker alone.

Plenty of GitHub issues have been filed, but most get marked duplicate or stale-closed. If you need more than one custom model in the picker, there's no official solution yet.

## References

- [Claude Code Model Configuration](https://docs.anthropic.com/en/docs/claude-code/settings#model-configuration) — Official model settings docs
- [Claude Code Environment Variables](https://docs.anthropic.com/en/docs/claude-code/settings#environment-variables) — Environment variable reference
- [#14443 — Configure custom models in /model picker](https://github.com/anthropics/claude-code/issues/14443)
- [#12738 — Opus 4.5 missing from model picker](https://github.com/anthropics/claude-code/issues/12738)
- [#35630 — ANTHROPIC_CUSTOM_MODEL_OPTION env var missing from docs](https://github.com/anthropics/claude-code/issues/35630)
- [#52310 — Bedrock availableModels ignored](https://github.com/anthropics/claude-code/issues/52310)
