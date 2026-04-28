---
title: 'Testing a Filesystem Service with memfs + FakeWatchService: No Disk Required'
description: 'A deep dive into testing a filesystem service using memfs to replace fs and a hand-written Fake to replace chokidar, making filesystem tests fast, deterministic, and security-aware.'
slug: memfs-fake-watch-testing
date: '2026-04-28T12:36:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- Vitest
- Node.js
draft: false
---

How do you test a Node.js service that operates on the filesystem? The obvious approach is to create real files under `/tmp`, run the tests, then clean up. But that comes with problems: slow I/O, inconsistent cross-platform behavior, CI permission differences, and file watcher events whose timing you can't control.

This post dissects a real `FileService` test suite to show how [memfs](https://github.com/streamich/memfs) and a hand-written FakeWatchService solve all of these.

## What the Service Looks Like

`FileService` implements a `IFileService` interface. It handles directory browsing, file listing (with fuzzy search), file reading/writing, and CRUD operations. It takes two optional external dependencies via constructor injection:

```typescript
export class FileService implements IFileService {
  constructor(
    private readonly roots: readonly string[],
    private readonly watch?: WatchService,
    private readonly fsImpl?: typeof import('node:fs'),
  ) {}
}
```

- `roots`: allowed root directories
- `watch`: optional `WatchService` for cache invalidation on file changes
- `fsImpl`: optional `fs` module implementation, passed to `glob`

All three are injected through the constructor — real implementations in production, fakes in tests. This is the foundation of the entire testing strategy.

## Replacing the Real Filesystem with memfs

The first step is swapping out `node:fs` and `node:fs/promises` entirely:

```typescript
import { vol, fs as memfs } from 'memfs';
import { FileService } from './file-service';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => (await import('memfs')).fs.promises);
```

[memfs](https://github.com/streamich/memfs) is a fully in-memory `fs` implementation. Its API is identical to Node.js's native `fs`, but everything happens in memory — no disk touched.

The dynamic import inside `vi.mock` factory functions is a Vitest requirement, but actual usage of `vol` and `memfs` is through top-level imports.

Before each test, `vol.fromJSON()` declaratively creates the needed file structure:

```typescript
const ROOT = '/test-root';
let service: FileService;

beforeEach(() => {
  vol.fromJSON({
    [join(ROOT, 'alpha/.keep')]: '',
    [join(ROOT, 'beta/nested/.keep')]: '',
    [join(ROOT, '.hidden/.keep')]: '',
    [join(ROOT, 'node_modules/.keep')]: '',
    [join(ROOT, '.git/.keep')]: '',
    [join(ROOT, 'src/index.ts')]: 'export {}',
    [join(ROOT, 'src/utils.ts')]: 'export const x = 1',
    [join(ROOT, 'package.json')]: '{}',
  });
  service = new FileService([ROOT], undefined, memfs);
});

afterEach(() => vol.reset());
```

Benefits:

- **Speed**: in-memory operations, no disk I/O
- **Isolation**: `vol.reset()` gives you a fresh filesystem — zero cross-test interference
- **Readability**: the JSON shows the entire file structure at a glance
- **Cross-platform**: no worrying about Windows path separators or `/tmp` permissions

## Replacing chokidar with FakeWatchService

`FileService` has an internal caching layer: the first `listFiles()` call runs glob to scan the directory tree, caching the result. Subsequent calls return the cache until a `WatchService` event invalidates it.

In production, chokidar watches for file changes, but chokidar events are asynchronous and non-deterministic. There's no way to precisely control "trigger an event now" in a test.

The solution is a Fake:

```typescript
export class FakeWatchService implements WatchService {
  private subs = new Map<string, Set<WatchCallback>>();

  subscribe(cwd: string, cb: WatchCallback): Unsubscribe {
    let set = this.subs.get(cwd);
    if (!set) {
      set = new Set();
      this.subs.set(cwd, set);
    }
    set.add(cb);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const s = this.subs.get(cwd);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) this.subs.delete(cwd);
    };
  }

  simulate(cwd: string, event: WatchEvent): void {
    const set = this.subs.get(cwd);
    if (!set) return;
    for (const cb of set) {
      try { cb(event); } catch (err) {
        console.error('[FakeWatchService] subscriber threw:', err);
      }
    }
  }
}
```

This isn't a mock — it's a Fake with real behavior. It genuinely manages subscribers, genuinely executes unsubscriptions, and genuinely dispatches events to all callbacks. The only difference is the event source: instead of OS-level inotify/FSEvents, events come from `simulate()` calls in test code.

> For more on the difference between Fakes and Mocks, see [DI + Fake + in-memory: Writing Maintainable Frontend Tests]({{< ref "/post/di-fake-in-memory-testing" >}}).

## Three Cache Invalidation Scenarios

With FakeWatchService, cache behavior becomes precisely verifiable.

**Scenario 1: No event → cache hit**

```typescript
it('second call without watcher event reuses cached file list', async () => {
  const watch = new FakeWatchService();
  const cached = new FileService([ROOT], watch, memfs);
  const a = await cached.listFiles(ROOT, '');
  vol.writeFileSync(join(ROOT, 'after-cache.ts'), '');
  const b = await cached.listFiles(ROOT, '');
  expect(b.some((f) => f.name === 'after-cache.ts')).toBe(false);
  expect(b.length).toBe(a.length);
});
```

A file was added via `vol.writeFileSync` before the second call, but no watch event was fired, so the cache stays valid. The new file doesn't appear.

**Scenario 2: Event fired → cache invalidated**

```typescript
it('watcher event invalidates cache so next call rebuilds', async () => {
  const watch = new FakeWatchService();
  const cached = new FileService([ROOT], watch, memfs);
  await cached.listFiles(ROOT, '');
  vol.writeFileSync(join(ROOT, 'after-invalidate.ts'), '');
  watch.simulate(ROOT, { type: 'add', path: 'after-invalidate.ts' });
  const b = await cached.listFiles(ROOT, '');
  expect(b.some((f) => f.name === 'after-invalidate.ts')).toBe(true);
});
```

After `watch.simulate()`, the cache is cleared and the next `listFiles()` rescans, picking up the new file.

**Scenario 3: Concurrent first calls subscribe only once**

```typescript
it('concurrent first calls do not subscribe duplicate watchers', async () => {
  const watch = new FakeWatchService();
  let subscribeCount = 0;
  const realSubscribe = watch.subscribe.bind(watch);
  watch.subscribe = (cwd, cb) => {
    subscribeCount++;
    return realSubscribe(cwd, cb);
  };
  const cached = new FileService([ROOT], watch, memfs);
  await Promise.all([cached.listFiles(ROOT, ''), cached.listFiles(ROOT, '')]);
  expect(subscribeCount).toBe(1);
});
```

Two concurrent `listFiles()` calls should only subscribe once. This verifies the `inflight promise` deduplication mechanism works correctly.

All three scenarios would be nearly impossible to write reliably with real chokidar — event timing and frequency aren't controllable.

## Security Tests Are First-Class Citizens

Security assertions are distributed across every `describe` block:

```typescript
// browseDirectories filters hidden directories
it('filters hidden directories', async () => {
  const names = (await service.browseDirectories(ROOT))
    .map((d: DirEntry) => d.name);
  expect(names).not.toContain('.hidden');
  expect(names).not.toContain('.git');
});

// readFile blocks path traversal
it('rejects path traversal', async () => {
  expect(await service.readFile(ROOT, '../../etc/passwd')).toEqual({
    error: 'Path traversal not allowed',
  });
});

// All mutations reject paths outside allowed roots
it('all mutations reject paths outside allowed roots', async () => {
  expect(await svc.create('/etc/passwd-clone', 'file'))
    .toMatchObject({ error: expect.any(String) });
  expect(await svc.delete('/etc/passwd'))
    .toMatchObject({ error: expect.any(String) });
  // rename, copy, move likewise...
});
```

These aren't in a separate "security test suite" — they live alongside feature tests. Every entry point has its own security verification.

The `isInsideRoot` boundary tests are worth noting:

```typescript
it('returns false for prefix-similar but not actually inside', () => {
  const sibling = `${ROOT}-sibling`;  // /test-root-sibling
  expect(service.isInsideRoot(sibling)).toBe(false);
});
```

`/test-root-sibling` has `/test-root` as a string prefix, but it's not inside the root. The implementation uses `path.relative()` to handle this correctly, and the test ensures that behavior.

## Tests Are Grouped by Behavior

The test file isn't organized as "one describe per method." It's grouped by behavior:

- **browseDirectories**: full browsing behavior including filtering, sorting, security checks
- **listFiles**: three pattern modes (empty, trailing slash, fuzzy) plus a dedicated describe for cache invalidation
- **readFile**: normal reads + path traversal
- **mutations**: isolated `MROOT` environment, full CRUD + out-of-bounds rejection
- **isInsideRoot**: pure logic boundary testing

Cache invalidation gets its own `describe('cache invalidation via WatchService')` because it's an independent behavioral concern with its own setup (requires FakeWatchService injection).

## How to Reuse This Pattern

The core of this strategy is three things:

1. **memfs replaces fs**: applicable to any service using `node:fs`. Two lines of `vi.mock`, declarative setup with `vol.fromJSON()`
2. **Hand-written Fakes replace non-deterministic dependencies**: file watchers, WebSockets, event emitters — anything async and event-driven benefits from the Fake + `simulate()` pattern
3. **Constructor injection makes replacement possible**: instead of `new Chokidar()` inside the service, inject a `WatchService` interface. Tests are just a beneficiary of this design

If your project has similar I/O boundaries — filesystem, database, external APIs, message queues — the same approach applies: define an interface, inject the dependency, swap in an in-memory Fake for tests.

> This approach is even more effective in a monorepo. When Fakes are extracted into shared packages, both frontend and backend can use the same test doubles with guaranteed behavioral consistency. See [Monorepo Shared Fakes: One Test Double from Frontend to Backend]({{< ref "/post/monorepo-shared-fake-testing" >}}).

## References

- [memfs — JavaScript file system utilities](https://github.com/streamich/memfs)
- [Vitest — Mocking](https://vitest.dev/guide/mocking)
- [Fuse.js — Lightweight fuzzy-search](https://www.fusejs.io/)
- [Martin Fowler — Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)
