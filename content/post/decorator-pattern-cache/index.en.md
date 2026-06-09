---
title: 'AI Added Caching to Your Code — And Quietly Polluted Your Business Logic'
description: 'Why AI-generated caching logic tends to leak into production code even when you ask for separation of concerns, and how the Decorator pattern actually solves it.'
slug: decorator-pattern-cache
date: '2026-06-09T10:00:00+08:00'
image: featured.png
categories:
- DevTools
tags:
- design-patterns
- cache
- TypeScript
- clean-architecture
draft: false
---

Ask AI to add caching to your code, and it will. The result looks clean — cache logic extracted into a separate class, business logic untouched. But look closer at your `UserService` or `OrderRepository`, and you'll find a new cache dependency, a few extra lines of if/else, and a full "check cache, miss DB, write back" flow baked right in.

The cache logic moved, but it crawled back in through a dependency and stuck to your business logic anyway.

## What AI Typically Produces: Cache Embedded in the Service

Say you have a `UserRepository` and ask AI to add caching. The most common output looks like this:

```typescript
class UserRepository {
  constructor(
    private db: Database,
    private cache: Cache  // new dependency
  ) {}

  async findById(id: string): Promise<User> {
    const key = `user:${id}`
    const cached = await this.cache.get(key)
    if (cached) return JSON.parse(cached)

    const user = await this.db.query('SELECT * FROM users WHERE id = ?', [id])
    await this.cache.set(key, JSON.stringify(user), 3600)
    return user
  }
}
```

Technically fine. But `UserRepository` now has two jobs: knowing how to query the database, and knowing how to use the cache. You need to mock two dependencies in tests, changing the cache strategy means touching this class, and every caller picks up the cache knowledge whether they want it or not.

## AI Knows About Separation of Concerns, But Still Misses the Point

Tell AI "separate concerns, don't put cache logic in the Repository," and it'll typically split out a `CachedUserRepository`:

```typescript
class UserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User> {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id])
  }
}

class CachedUserRepository {
  constructor(
    private repo: UserRepository,  // depends on the concrete class, not an interface
    private cache: Cache
  ) {}

  async findById(id: string): Promise<User> {
    const key = `user:${id}`
    const cached = await this.cache.get(key)
    if (cached) return JSON.parse(cached)

    const user = await this.repo.findById(id)
    await this.cache.set(key, JSON.stringify(user), 3600)
    return user
  }
}
```

`UserRepository` is clean. But now the calling code has to decide: use `UserRepository` or `CachedUserRepository`? That choice forces the caller to know about both variants — knowledge it shouldn't have to carry.

And `CachedUserRepository` depends on the concrete `UserRepository`, not an interface. Swap the data source, introduce a mock — `CachedUserRepository` breaks too.

## The Decorator Pattern: Cache Is Invisible to Callers

The right approach: define an interface first, then implement caching as a decorator.

```typescript
// 1. Define the interface — the only contract
interface IUserRepository {
  findById(id: string): Promise<User>
  findAll(): Promise<User[]>
}

// 2. Core implementation only handles data access — no cache knowledge
class UserRepository implements IUserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User> {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id])
  }

  async findAll(): Promise<User[]> {
    return this.db.query('SELECT * FROM users')
  }
}

// 3. Decorator implements the same interface, wraps any IUserRepository
class CachedUserRepository implements IUserRepository {
  constructor(
    private inner: IUserRepository,  // depends on the interface, not the concrete class
    private cache: Cache
  ) {}

  async findById(id: string): Promise<User> {
    const key = `user:${id}`
    const cached = await this.cache.get(key)
    if (cached) return JSON.parse(cached)

    const user = await this.inner.findById(id)
    await this.cache.set(key, JSON.stringify(user), 3600)
    return user
  }

  async findAll(): Promise<User[]> {
    const key = 'users:all'
    const cached = await this.cache.get(key)
    if (cached) return JSON.parse(cached)

    const users = await this.inner.findAll()
    await this.cache.set(key, JSON.stringify(users), 300)
    return users
  }
}
```

Composition at the DI container or composition root:

```typescript
const userRepository: IUserRepository = new CachedUserRepository(
  new UserRepository(db),
  cache
)
```

`UserService` only needs an `IUserRepository` — no idea whether there's a cache layer underneath:

```typescript
class UserService {
  constructor(private users: IUserRepository) {}  // only knows the interface

  async getUser(id: string): Promise<User> {
    return this.users.findById(id)
  }
}
```

Whether caching exists, what strategy it uses — `UserService` doesn't know and doesn't need to.

## Tests Become Cleanly Separated Too

`UserRepository` tests only need a DB connection or DB mock:

```typescript
describe('UserRepository', () => {
  it('should query user by id', async () => {
    const db = createMockDb({ id: '1', name: 'Alice' })
    const repo = new UserRepository(db)
    const user = await repo.findById('1')
    expect(user.name).toBe('Alice')
  })
})
```

`CachedUserRepository` tests mock `IUserRepository` and `Cache` — no DB involved:

```typescript
describe('CachedUserRepository', () => {
  it('should return cached result without hitting inner repo', async () => {
    const inner = { findById: vi.fn(), findAll: vi.fn() }
    const cache = createMockCache({ 'user:1': JSON.stringify({ id: '1', name: 'Alice' }) })
    const repo = new CachedUserRepository(inner, cache)

    const user = await repo.findById('1')
    expect(inner.findById).not.toHaveBeenCalled()  // cache hit, inner not called
    expect(user.name).toBe('Alice')
  })

  it('should call inner and populate cache on miss', async () => {
    const inner = { findById: vi.fn().mockResolvedValue({ id: '2', name: 'Bob' }), findAll: vi.fn() }
    const cache = createMockCache({})
    const repo = new CachedUserRepository(inner, cache)

    await repo.findById('2')
    expect(inner.findById).toHaveBeenCalledWith('2')
    expect(await cache.get('user:2')).not.toBeNull()
  })
})
```

Two classes, two independent test suites, each covering only their own layer.

## Why AI Can't Do This on Its Own

When AI receives a "add caching" request, its training data is dominated by the pattern of adding a cache check inline in the existing method — shortest path, most common in tutorials.

Even if your skill or prompt says "separation of concerns," AI typically interprets that as "move cache logic to another class" — which still produces a wrapper that's tightly coupled to a specific data source rather than a substitutable decorator.

The Decorator pattern requires deciding where interface boundaries live before writing any code. That design decision happens upstream of implementation, and AI can't make it for you without an explicit directive.

## The Same Pattern Works for Other Cross-Cutting Concerns

Caching is just one example. Logging, retry, rate limiting, telemetry — all cross-cutting concerns, all handle the same way:

```typescript
// Logging decorator
class LoggingUserRepository implements IUserRepository {
  constructor(
    private inner: IUserRepository,
    private logger: Logger
  ) {}

  async findById(id: string): Promise<User> {
    this.logger.info(`findById: ${id}`)
    const start = performance.now()
    const user = await this.inner.findById(id)
    this.logger.info(`findById: ${id} took ${performance.now() - start}ms`)
    return user
  }
  // ...
}

// Stack multiple decorators
const repo: IUserRepository = new LoggingUserRepository(
  new CachedUserRepository(
    new UserRepository(db),
    cache
  ),
  logger
)
```

Each layer does one thing. They compose freely. Callers only ever see `IUserRepository`.

## Wrapping Up

AI will add caching, but what it adds tends to inject dependencies into business logic, or shift the coupling somewhere else without actually removing it.

The fix isn't complicated: define the interface first, put the cache layer outside as a decorator, leave the business logic untouched. Independent tests, swappable strategies, zero knowledge burden on callers.

Next time you ask AI to add caching, figure out the interface boundary yourself first, then let it fill in the implementation. That's the workflow that actually holds together.

## References

- [Keeping cross-cutting concerns out of application code — Mark Seemann](https://blog.ploeh.dk/2024/09/02/keeping-cross-cutting-concerns-out-of-application-code/)
- [Decorator Pattern in .NET: Add Caching, Logging, and More — Medium](https://medium.com/@thecodeman/decorator-pattern-in-net-explained-add-caching-logging-and-more-with-ease-cae51d4bd6de)
- [Decorator Design Pattern — DevIQ](https://deviq.com/design-patterns/decorator-pattern/)
- [AI-Generated Code Quality Crisis — Kunal Ganglani](https://www.kunalganglani.com/blog/ai-generated-code-quality-crisis)
