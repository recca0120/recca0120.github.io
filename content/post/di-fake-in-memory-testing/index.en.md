---
title: 'DI + Fake + in-memory: Writing Frontend Tests That Survive Refactors'
description: 'A three-part testing approach combining dependency injection, Fakes, and in-memory implementations. Learn why Fakes beat Mocks for maintenance and how to write reusable, trustworthy in-memory Fakes with FakeStorageService as a worked example.'
slug: di-fake-in-memory-testing
date: '2026-04-20T07:00:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- Vitest
- TypeScript
draft: false
---

The most common testing pattern I see looks like this:

```typescript
test('saves user data', () => {
  const mockStorage = {
    set: vi.fn(),
    get: vi.fn().mockReturnValue(null),
  };
  const service = new UserService(mockStorage);

  service.save({ id: 1, name: 'Alice' });

  expect(mockStorage.set).toHaveBeenCalledWith('user:1', { id: 1, name: 'Alice' });
});
```

Looks fine. Tests pass. But this approach has a long-term problem: **tests are coupled to implementation details**. The day `UserService` switches from `set` to `setItem`, or wraps a namespace around the key, the test breaks. Every internal change requires a test change.

Fake + in-memory sidesteps these traps. This post walks through how three concepts fit together: **DI (architecture) + Fake (pattern) + in-memory (implementation technique)**.

## First: Why DI Matters

Dependency Injection's core idea is "don't `new` dependencies inside a class." The connection to testing is straightforward: **it lets you swap implementations**.

Without DI:

```typescript
class UserService {
  save(user: User) {
    localStorage.setItem(`user:${user.id}`, JSON.stringify(user));
  }
}
```

No way to swap out `localStorage` during tests — you end up spying on globals or using `vi.stubGlobal`. Ugly, and tests bleed state between each other.

With DI:

```typescript
interface StorageService {
  set(key: string, value: unknown): void;
  get(key: string): unknown;
}

class UserService {
  constructor(private storage: StorageService) {}

  save(user: User) {
    this.storage.set(`user:${user.id}`, user);
  }
}
```

Now `localStorage` can be replaced with anything during tests — including the Fake we're about to build.

No framework required. Constructor injection is enough. Frontend frameworks (React, Vue) achieve the same thing via context or providers.

## The Problem with Mocks

The biggest issue with mocks is that **each test has to assemble its own**. Adding a "get should return a value" scenario to the test above:

```typescript
const mockStorage = {
  set: vi.fn(),
  get: vi.fn().mockImplementation((key) => {
    if (key === 'user:1') return JSON.stringify({ id: 1, name: 'Alice' });
    return null;
  }),
};
```

Mocks don't know that `get` should return what was just `set` — they have no state. Every test has to manually configure the interaction order and return values.

Worse, **assertions hook into calls**: `expect(mock.set).toHaveBeenCalledWith(...)`. You're verifying "which internal method got called" instead of "what observable outcome was produced." Touch the implementation, break the test.

## What a Fake Is

A Fake is **a real implementation** — just a simplified one. It implements the same interface as production, but stores data and runs logic in memory.

```typescript
class FakeStorageService implements StorageService {
  private store = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get(key: string): unknown {
    return this.store.get(key) ?? null;
  }

  // test-friendly helpers
  has(key: string): boolean {
    return this.store.has(key);
  }

  reset(): void {
    this.store.clear();
  }
}
```

Key differences from a mock:

- **Has state**: what you `set` is what you `get` back
- **Predictable**: behaves like production, not made up per-test
- **Reusable**: one copy for the whole project, not hand-assembled per test

## Rewriting the Test with a Fake

```typescript
test('saves user data', () => {
  const storage = new FakeStorageService();
  const service = new UserService(storage);

  service.save({ id: 1, name: 'Alice' });

  expect(storage.get('user:1')).toEqual({ id: 1, name: 'Alice' });
});
```

Differences:

1. No `expect(...).toHaveBeenCalledWith(...)` — we assert the thing **actually exists** in storage
2. We test behavior (stored data can be retrieved), not implementation (the `set` method was called)
3. If `UserService` switches to `setItem` internally or wraps keys in a namespace, the test survives as long as the interface doesn't change

## Building a Good In-Memory Fake

A few design points that matter:

**1. Implement the production interface**

Most important rule. A Fake must share the same interface as the production implementation:

```typescript
class FakeStorageService implements StorageService { ... }
class LocalStorageService implements StorageService { ... }
```

This guarantees test and runtime behavior align. A Fake without a shared interface is a pretend — you're testing a system you imagined, not the one you built.

**2. Provide test-only setup methods**

Fakes can add methods production doesn't need, for arranging state:

```typescript
class FakeStorageService implements StorageService {
  // production interface
  set(key: string, value: unknown) { ... }
  get(key: string) { ... }

  // test-only helpers
  seed(entries: Record<string, unknown>) {
    Object.entries(entries).forEach(([k, v]) => this.store.set(k, v));
  }

  throwOnNextSet(error: Error) {
    this.nextError = error;
  }
}
```

These keep the arrange step clean:

```typescript
test('loads existing user', () => {
  const storage = new FakeStorageService();
  storage.seed({ 'user:1': { id: 1, name: 'Alice' } });

  const service = new UserService(storage);
  expect(service.load(1)).toEqual({ id: 1, name: 'Alice' });
});
```

**3. Have a reset method**

Tests must be isolated. Provide `reset()` so each test starts clean:

```typescript
beforeEach(() => {
  storage.reset();
});
```

Or create a fresh instance per test. The latter is cleaner — you can't forget to reset something that doesn't exist.

## The Fake Itself Needs Tests

Something most people never consider: **the Fake's behavior must be tested**.

The Fake stands in for production across your entire test suite. If the Fake misbehaves, every test built on top of it rests on a false foundation.

```typescript
describe('FakeStorageService', () => {
  test('get returns what was set', () => {
    const storage = new FakeStorageService();
    storage.set('foo', 'bar');
    expect(storage.get('foo')).toBe('bar');
  });

  test('get returns null for missing key', () => {
    const storage = new FakeStorageService();
    expect(storage.get('missing')).toBeNull();
  });

  test('reset clears all data', () => {
    const storage = new FakeStorageService();
    storage.set('foo', 'bar');
    storage.reset();
    expect(storage.get('foo')).toBeNull();
  });
});
```

The value of these tests: **they describe the Fake's invariants**. With those written down, reusing the Fake elsewhere is safe — its behavior is known.

## When to Use Fake vs Stub

Fake isn't always the right tool. Some cases are a better fit for Stub (pure input/output).

**Use a Fake when**
- The dependency has state (storage, cache, database, session)
- The dependency's behavior needs to stay consistent across tests
- Multiple tests share this dependency
- You need to verify "what went in can come out" style interactions

**Use a Stub when**
- The dependency is purely "input → output"
- Only a few tests need it
- Different tests need very different return values
- A full Fake isn't worth building (e.g. complex external API responses)

Most projects mix both: shared services get a Fake, one-off external dependencies get a stub.

## Summary

The full flow:

1. **Write production code with DI** — inject dependencies via constructor, never `new` them inside
2. **Define interfaces** — both production and test doubles implement the same one
3. **Write the Fake** — in-memory implementation with seed/reset helpers
4. **Test the Fake** — verify its own invariants
5. **Test production code** — use the Fake as a stand-in, assert behavior not method calls

This combo gives tests three long-term wins: not coupled to implementation details, clean cross-test state, and a trustworthy Fake validated on its own.

The next post covers **how a single Fake can power tests from the frontend down through the backend in a monorepo** — where this pattern really shines.

## Series continuation

- [Shared Fakes across a monorepo]({{< ref "/post/monorepo-shared-fake-testing" >}}) — one Fake from frontend to backend
- [Shared HTTP mocks across a monorepo]({{< ref "/post/monorepo-shared-http-mock" >}}) — MSW for external APIs
- [Why AI agents need good tests even more]({{< ref "/post/agent-friendly-testing" >}}) — how this pattern helps Claude Code

## References

- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
- [Mocks Aren't Stubs — Martin Fowler](https://martinfowler.com/articles/mocksArentStubs.html)
- [Vitest Documentation](https://vitest.dev/)
- [Dependency Injection — Martin Fowler](https://martinfowler.com/articles/injection.html)
