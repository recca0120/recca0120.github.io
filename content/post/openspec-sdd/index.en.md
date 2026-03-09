---
title: 'OpenSpec: Make AI Coding Assistants Follow a Spec, Not Just Guess'
date: '2026-03-08T09:00:00+08:00'
slug: openspec-sdd
image: cover.jpg
description: "OpenSpec is a spec-driven development framework. Before AI writes code, align on requirements first. Propose generates spec documents, apply implements by spec, archive records completed changes. Supports Claude Code, Cursor, Copilot, and 30+ tools."
categories:
  - Tools
  - DevOps
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

## Core Architecture

OpenSpec splits your project knowledge into two parts:

```
openspec/
├── specs/              ← source of truth (current behavior)
│   ├── auth/
│   │   └── spec.md
│   └── payments/
│       └── spec.md
└── changes/            ← in-progress modifications (one folder per change)
    ├── add-dark-mode/
    └── archive/        ← completed changes archived here
```

**Specs** describe the system's current behavior. **Changes** are proposed modifications. Managed separately, multiple changes can proceed in parallel without conflict.

## Install

Requires Node.js 20.19.0+:

```bash
npm install -g @fission-ai/openspec@latest
cd your-project
openspec init
```

Supports npm, pnpm, yarn, bun, nix.

## Basic Workflow: propose → apply → archive

### 1. Propose: Describe the Change

```
/opsx:propose add-dark-mode
```

AI produces four artifacts at once:

```
openspec/changes/add-dark-mode/
├── proposal.md       # why, scope (in/out of scope)
├── specs/            # delta spec: what behavior is added/changed/removed
│   └── ui/
│       └── spec.md
├── design.md         # technical approach, architecture decisions
└── tasks.md          # implementation checklist (checkboxes)
```

Each artifact has a clear responsibility:

| Artifact | Question It Answers |
|---|---|
| `proposal.md` | Why are we doing this? What's the scope? |
| `specs/` | What system behavior changed? (Delta) |
| `design.md` | How do we implement it technically? What architecture? |
| `tasks.md` | What are the implementation steps? What's done? |

### 2. Apply: Implement by Spec

```
/opsx:apply
```

AI follows `tasks.md` item by item, checking off each one:

```
Working on 1.1: Create ThemeContext...
✓ 1.1 Complete

Working on 1.2: Add CSS custom properties...
✓ 1.2 Complete
```

It won't go off-script. If interrupted, it picks up where it left off next time.

### 3. Archive: Record Completion

```
/opsx:archive
```

Archive does two things:
1. **Merges delta specs** into `openspec/specs/` (updates source of truth)
2. **Moves the change folder** to `openspec/changes/archive/2026-03-08-add-dark-mode/`

Specs grow incrementally with each archive, forming a complete system behavior document over time.

## Spec Format

Specs are behavior contracts, not implementation details. Described using requirements + scenarios:

```markdown
# Auth Specification

## Purpose
Authentication and session management.

## Requirements

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

#### Scenario: Valid credentials
- GIVEN a user with valid credentials
- WHEN the user submits login form
- THEN a JWT token is returned
- AND the user is redirected to dashboard

#### Scenario: Invalid credentials
- GIVEN invalid credentials
- WHEN the user submits login form
- THEN an error message is displayed
- AND no token is issued
```

Given/When/Then for scenarios, each one testable. RFC 2119 keywords (MUST/SHALL/SHOULD/MAY) express requirement strength.

## Delta Spec: Describing "What Changed"

This is OpenSpec's most important concept. Modifications don't rewrite the entire spec — they describe the diff:

```markdown
# Delta for Auth

## ADDED Requirements

### Requirement: Two-Factor Authentication
The system MUST support TOTP-based two-factor authentication.

#### Scenario: 2FA login
- GIVEN a user with 2FA enabled
- WHEN the user submits valid credentials
- THEN an OTP challenge is presented

## MODIFIED Requirements

### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes of inactivity.
(Previously: 30 minutes)

## REMOVED Requirements

### Requirement: Remember Me
(Deprecated in favor of 2FA.)
```

Three sections, each with a clear meaning:

| Section | Meaning | Archive Action |
|---|---|---|
| `ADDED` | New behavior | Added to main spec |
| `MODIFIED` | Changed existing behavior | Replaces original requirement |
| `REMOVED` | Removed behavior | Deleted from main spec |

Why delta instead of rewriting the entire spec? **Because two parallel changes can each modify different requirements of the same spec without conflict.**

## Explore Mode: When You're Not Sure What to Do

```
/opsx:explore
```

Discuss with AI first — it analyzes the codebase, compares approaches, draws architecture diagrams. No artifacts produced. Once you've thought it through, run `/opsx:propose`.

```
You: /opsx:explore
AI:  What would you like to explore?

You: How should we handle authentication for the mobile app?
AI:  Let me investigate your current auth setup...
     I see you're using session-based auth for the web app.
     For mobile, we have three options:
     1. JWT tokens (stateless, works offline)
     2. OAuth2 (third-party login)
     3. Extend current sessions (simpler)

You: Let's go with JWT.
AI:  Ready. Run /opsx:propose add-jwt-auth to begin.
```

## Advanced Commands

### Expanded Workflow (requires profile switch)

```bash
openspec config profile   # choose expanded workflow
openspec update           # refresh AI instructions
```

| Command | Purpose |
|---|---|
| `/opsx:new` | Create folder only, no artifacts (manual pacing) |
| `/opsx:continue` | Produce next artifact in dependency order |
| `/opsx:ff` | Fast-forward, produce all artifacts at once |
| `/opsx:verify` | Verify implementation matches spec |
| `/opsx:sync` | Manually merge delta spec (without archiving) |
| `/opsx:bulk-archive` | Archive multiple changes at once |
| `/opsx:onboard` | Guided tutorial using your own codebase |

### continue vs ff

`/opsx:continue` produces one artifact at a time, letting you review step by step:

```
proposal → (review) → specs → (review) → design → (review) → tasks
```

`/opsx:ff` produces everything at once — for when you already know exactly what you want.

### verify: Three Dimensions of Validation

```
/opsx:verify
```

| Dimension | What It Checks |
|---|---|
| **Completeness** | All tasks done? All requirements have corresponding implementation? |
| **Correctness** | Implementation matches spec intent? Edge cases handled? |
| **Coherence** | Code consistent with design.md decisions? Naming conventions uniform? |

Reports come in three levels: CRITICAL, WARNING, SUGGESTION. Won't block archiving, but lets you know what needs attention.

## Schema: Customize the Artifact Flow

The default `spec-driven` schema flow is:

```
proposal → specs → design → tasks → implement
         ↘              ↗
          (design only depends on proposal, can run parallel with specs)
```

You can define custom schemas, e.g. adding a research phase:

```yaml
# openspec/schemas/research-first/schema.yaml
name: research-first
artifacts:
  - id: research
    generates: research.md
    requires: []

  - id: proposal
    generates: proposal.md
    requires: [research]

  - id: tasks
    generates: tasks.md
    requires: [proposal]
```

```bash
openspec schema init research-first
```

## Supported Tools

OpenSpec isn't locked to a specific AI tool. It supports 30+ coding assistants:

| Tool | Command Format |
|---|---|
| Claude Code | `/opsx:propose`, `/opsx:apply` |
| Cursor | `/opsx-propose`, `/opsx-apply` |
| Windsurf | `/opsx-propose`, `/opsx-apply` |
| GitHub Copilot (IDE) | `/opsx-propose`, `/opsx-apply` |
| Codex / Gemini CLI / Amazon Q | Each has its own integration |

Basically any AI tool that can read files and handle slash commands works.

## Compared to Alternatives

| | OpenSpec | Spec Kit (GitHub) | Kiro (AWS) |
|---|---|---|---|
| Philosophy | Lightweight, fluid | Complete but heavyweight | Powerful but IDE-locked |
| Phase control | No phase gates | Strict phase gates | Locked to specific models |
| Brownfield | Native support (delta spec) | Requires full rewrite | Limited |
| Tool lock-in | 30+ tools | GitHub ecosystem | Kiro IDE only |
| Format | Markdown + Git | Markdown + Python | Built-in format |

## What It Actually Feels Like

The biggest difference after using it: **AI stops going off on tangents.**

Before, every new conversation required re-explaining "what this project looks like, what decisions were made before." Now AI reads `openspec/specs/` and already knows.

The scope distinction in `proposal.md` (in scope / out of scope) is especially useful. Write down "what we're NOT doing" and AI won't "helpfully" do things you didn't ask for.

`design.md` is also valuable — it forces you to think through the technical approach before writing code. Many times, the design phase reveals "this approach won't work, let's try another one" — saving the time of discovering that after implementation.

The only cost is one extra step: you can't just tell AI "add dark mode" and wait for results. You propose, review, then apply. But the payoff is predictability and traceability, which is worth it for anything beyond trivial changes.

**Not suitable for**: changing one line of CSS, fixing a typo — just do it directly, no need for the propose flow.

## Summary

OpenSpec doesn't replace AI coding assistants — it adds a spec layer in front of them.

Core concepts:
- **Specs** — source of truth for system behavior
- **Changes** — describe modifications with delta specs, don't rewrite the whole spec
- **Artifacts** — proposal (why) → specs (what changes) → design (how) → tasks (what to do)
- **Archive** — merge deltas into main spec after completion, forming the system's evolution record

v1.2.0 (February 2026), 28k+ GitHub stars, MIT license.

## References

- [OpenSpec Official Website](https://openspec.dev/) — Official documentation, quick start, and tool integration guides
- [OpenSpec npm Package: @fission-ai/openspec](https://www.npmjs.com/package/@fission-ai/openspec) — Installation and version information
- [RFC 2119: Key Words for Requirement Levels](https://www.rfc-editor.org/rfc/rfc2119) — Formal definition of MUST/SHALL/SHOULD/MAY keywords
- [Claude Code Official Documentation](https://docs.anthropic.com/en/docs/claude-code) — AI coding assistant that integrates with OpenSpec
