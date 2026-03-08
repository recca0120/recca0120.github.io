---
title: 'OpenSpec: Make AI Coding Assistants Follow a Spec, Not Just Guess'
date: '2026-03-08T09:00:00+08:00'
slug: openspec-sdd
description: "OpenSpec is a spec-driven development framework. Before AI writes code, align on requirements first. Propose generates spec documents, apply implements by spec, archive records completed changes. Supports Claude Code, Cursor, Copilot, and 30+ tools."
categories:
  - DevTools
tags:
  - openspec
  - ai
  - sdd
  - claude-code
  - cursor
  - developer-tools
  - workflow
---

The most common problem with AI coding assistants isn't that they can't write code — it's that they write something different from what you had in mind.

You say "add dark mode" and it rewrites CSS variables, adds a toggle button, and refactors the layout — when all you wanted was to change color tokens. Next conversation, context is gone, and it guesses your intent from scratch.

[OpenSpec](https://openspec.dev/) solves this: before AI starts writing code, it produces a spec document. Both sides align on "what to do" and "how to do it", then implement according to the spec.

## Core Concept

OpenSpec is a Spec-Driven Development (SDD) framework:

1. **Propose** — Describe what you want to change, AI produces proposal, specs, design, tasks
2. **Apply** — AI implements step by step following the task checklist
3. **Archive** — Archive completed changes with a record

Spec files live in your codebase, managed with Git. Context doesn't disappear between conversations.

## Install

Requires Node.js 20.19.0+:

```bash
npm install -g @fission-ai/openspec@latest
```

Initialize in your project:

```bash
cd your-project
openspec init
```

This creates the `openspec/` directory structure and registers slash commands with your AI tool.

Supports npm, pnpm, yarn, bun, nix.

## Basic Workflow

### 1. Propose: Describe the Change

```
/opsx:propose add-dark-mode
```

AI automatically creates:

```
openspec/changes/add-dark-mode/
├── proposal.md       # why and what's changing
├── specs/            # requirements, user scenarios
├── design.md         # technical approach
└── tasks.md          # implementation checklist
```

`proposal.md` captures motivation and scope, `design.md` captures technical decisions, `tasks.md` is a trackable implementation plan.

Review and adjust at this stage. Confirm the direction is right before moving on.

### 2. Apply: Implement by Spec

```
/opsx:apply
```

AI follows the `tasks.md` checklist item by item, checking off each one. It won't go off-script.

### 3. Archive: Record Completion

```
/opsx:archive
```

Completed changes move to `openspec/changes/archive/` with a date prefix:

```
openspec/changes/archive/2026-03-09-add-dark-mode/
```

Specs stay in the codebase. New team members can browse `openspec/specs/` to understand the system.

## Why This Matters

### Context Persists

The biggest problem with AI coding assistants is amnesia between conversations. OpenSpec specs live on the filesystem. When a new conversation starts, the AI reads existing specs and knows what the system looks like.

```
openspec/specs/
├── auth-login/
├── auth-session/
├── checkout-cart/
└── checkout-payment/
```

### Review Intent, Not Just Code

Every change produces a spec delta — a requirements-level diff. Code review shows implementation details. Spec review shows "what behavior did this change modify in the system."

### Constrain AI's Scope

Without a spec, AI decides how much to do on its own. With `tasks.md`, it follows the checklist. No "while I'm at it" refactoring of things you didn't ask it to touch.

## Advanced Commands

Beyond the basic propose → apply → archive:

```bash
/opsx:continue       # resume unfinished work
/opsx:ff             # fast-forward implementation (skip confirmations)
/opsx:verify         # verify tasks are actually complete
/opsx:sync           # sync specs when code changed but specs didn't
/opsx:bulk-archive   # archive multiple completed changes at once
/opsx:onboard        # scan existing code to generate initial specs
```

`/opsx:onboard` is especially useful for brownfield projects — you don't need to write specs from scratch. AI scans existing code and generates them.

## Supported Tools

OpenSpec isn't locked to a specific AI tool. It supports 30+ coding assistants:

- **Claude Code** — native slash command integration
- **Cursor** — via `.cursor/rules`
- **GitHub Copilot** — via Copilot Chat
- **Windsurf** / **Codex** / **Gemini CLI** and more

Any AI tool that can read files and handle slash commands works.

## Profiles

```bash
openspec config profile
```

Choose different workflow profiles to control the interaction style and step granularity.

## Updating

```bash
# update global CLI
npm install -g @fission-ai/openspec@latest

# refresh AI instructions in your project
openspec update
```

## Compared to Alternatives

| | OpenSpec | Built-in Plan Mode | Other Planning Tools |
|---|---|---|---|
| Cross-session persistence | Specs in files | Gone when chat ends | Varies |
| Brownfield support | onboard command | Not supported | Usually start from scratch |
| Tool lock-in | 30+ tools | Single IDE | Usually locked |
| Spec format | Markdown, Git-friendly | No file output | Varies |

## What It Actually Feels Like

The biggest difference after using it: AI stops going off on tangents.

Before, every new conversation required re-explaining "what this project looks like, what decisions were made before." Now AI reads `openspec/specs/` and already knows.

The `design.md` from the propose phase is also valuable — it forces you (and the AI) to think through the technical approach before writing code. Many times, the design phase reveals "this approach won't work, let's try another one" — saving the time of discovering that after implementation.

The only cost is one extra step: you can't just tell AI "add dark mode" and wait for results. You propose, review, then apply. But the payoff is predictability and traceability, which is worth it for anything beyond trivial changes.

## Summary

OpenSpec doesn't replace AI coding assistants — it adds a spec layer in front of them.

- **Propose** — align first, don't let AI guess
- **Apply** — implement by spec, don't over-do
- **Archive** — keep records, no re-explaining next time

v1.2.0 (February 2026) is the latest release, 28k+ GitHub stars, MIT license. For anyone using AI to write code who feels "it often does something different from what I intended."
