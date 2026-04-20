---
title: 'Why AI Agents Need Good Tests More Than Humans Do: The Agent-Friendly Properties of Fake + MSW'
description: 'The three-article series on Fake + MSW + shared test infrastructure helps AI agents like Claude Code even more than humans. Five concrete benefits: fast feedback, trustworthy signals, imitable patterns, safe refactors, and context efficiency.'
slug: agent-friendly-testing
date: '2026-04-20T08:00:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- Claude Code
- AI
draft: false
---

The previous three-post series covered [DI + Fake + in-memory]({{< ref "/post/di-fake-in-memory-testing" >}}), [monorepo shared Fakes]({{< ref "/post/monorepo-shared-fake-testing" >}}), and [shared HTTP mocks]({{< ref "/post/monorepo-shared-http-mock" >}}). These patterns were meant for humans — readable, editable, refactor-safe.

But after months of daily development with Claude Code, it became clear these patterns help AI agents even more than they help humans. Here's why, in five concrete points.

## 1. Fast Feedback Loops: Agents Know Immediately If They're Right

In-memory Fakes skip networks, Docker, and databases. A full test suite usually runs in seconds.

AI agents work in a tight loop: **change code → run tests → read result → decide next step**. The faster this loop runs, the more precisely the agent can steer toward the correct answer.

Tests that take 30+ seconds cause two problems:

- **Agent skips running tests**: "too slow, I'll just continue by intuition" — problems accumulate until they all explode at once
- **Agent guesses wrong**: while waiting for tests, the agent has already changed the next section of code. When the red light finally shows, five things have changed and nobody knows which one broke.

Fake + in-memory lets tests run in milliseconds. Every line of change can be validated instantly.

## 2. Trustworthy Signals: No Flaky Tests

Fake behavior is deterministic — seed some data, get it back. MSW interception is deterministic — write the handler, get that response.

Determinism matters more for agents than humans. Flakiness for a human is a mild "just rerun" annoyance. For an agent, it's a disaster:

- Red light → agent thinks it did something wrong, starts thrashing
- Changes until green → agent thinks the bug is fixed, but the test just randomly passed
- Massive token waste chasing phantom bugs

`setTimeout(r, 500)` waits for async, real API network flaps, shared DB state leaks — all flakiness sources. Fake + MSW eliminates them. Red means truly broken, green means truly working.

## 3. New Tests Have Templates to Copy

Agents excel at "look at existing patterns, copy them."

If a monorepo has `shared/testing/fakes/`, an agent writing new tests just does:

```typescript
import { FakeUserService } from '@app/shared/testing';

test('new scenario', () => {
  const userService = new FakeUserService();
  userService.seed([...]);
  // ...
});
```

No inventing new patterns, no deciding "should this be a mock or a stub", no looking up the variants of `vi.fn().mockResolvedValue(...)`.

The opposite: in a project where each package mocks its own way, agents burn context every time they open a new file trying to understand "how does this file mock things." Context goes to mock conventions instead of the real task.

## 4. Behavior Tests Make Refactors Safe

Refactoring is one of the most common agent tasks. If tests are coupled to implementation details:

```typescript
expect(mockStorage.set).toHaveBeenCalledWith('user:1', alice);
```

Any refactor (switching to `setItem`, adding a namespace prefix) breaks the test. Agents enter the "edit production code while editing tests" mode — at which point tests lose their guard role entirely. Whatever the agent changes in the test will pass, so there's no more "did I break anything?" signal.

Fake + behavioral assertions:

```typescript
expect(await storage.get('user:1')).toEqual(alice);
```

As long as `UserService` keeps the same observable behavior, refactors don't break the test. The agent can rewrite internals confidently — red means "behavior broke," not "implementation details changed."

This gap turns "I daren't touch this" into "I'll refactor boldly."

## 5. Context Saved for Real Work

Claude Code's context window is finite. Every file, every convention, every mock variation consumes tokens.

Shared test infrastructure: the agent only needs to load type definitions from `shared/testing/` to write tests anywhere in the monorepo. No server-specific mock conventions, no client-specific ones.

The saved context goes to things that matter: understanding requirements, reading business logic, thinking about edge cases.

## Design Principles for Agent-Friendly Tests

Reverse-engineering those five points, agent-friendly tests follow a few principles:

**1. Tests must be fast**
Any single test over a second deserves scrutiny. In-memory Fake, MSW interception — don't make the agent wait on the network.

**2. Dependencies must be injectable**
No DI, no swappable dependencies. No Fake, no fast isolation.

**3. Tests need templates**
`shared/testing/` is the best investment. One good template means every subsequent test looks the same.

**4. Assert behavior, not implementation**
`toHaveBeenCalledWith` is a refactor landmine. Prefer `expect(state).toEqual(...)` when possible.

**5. The Fake itself must be tested**
Agents trust Fake behavior; the Fake's invariants must be proven first. The return on that investment: every agent-written test stands on a solid foundation.

## Practical Advice for Claude Code Users

If you're using Claude Code or similar agents for daily development, spending a day refactoring your project to match this pattern has enormous long-term returns:

- Agent-written features are guarded by trustworthy tests
- Agent refactors have clear signals whether something broke
- Agent bug fixes can actually prove "the bug is now fixed"

Conversely, if your project is "sprinkle `vi.fn()` everywhere, no shared Fakes, tests take 30 seconds, occasional flakes," agent efficiency takes a major hit — every decision is a gamble rather than a verification.

## A Parting Observation

The old motivation for writing good tests was "reduce human reviewer burden." Now there's a new one: **let agents make decisions safely**.

Interestingly, both needs have the same answer: fast, stable, predictable, behavior-oriented. Good tests benefit humans; they benefit AI agents even more.

The patterns in this three-part series weren't designed for AI agents, but they happen to be agent-friendly — because **good tests should already look like this**. Agents just raised the bar one notch higher on what "good" means.

## References

- [DI + Fake + in-memory testing foundations]({{< ref "/post/di-fake-in-memory-testing" >}})
- [Sharing Fakes across a monorepo]({{< ref "/post/monorepo-shared-fake-testing" >}})
- [Sharing HTTP mocks across a monorepo]({{< ref "/post/monorepo-shared-http-mock" >}})
- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code)
