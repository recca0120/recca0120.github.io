---
title: 'Shared Fakes Across a Monorepo: One Test Double from Frontend to Backend'
description: 'Writing separate mocks for frontend, backend, and business logic in a monorepo is duplicated effort and produces inconsistent behavior. This post shows how to design shared Fakes so one test double works from React components to API routes to services.'
slug: monorepo-shared-fake-testing
date: '2026-04-20T07:30:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- Vitest
- TypeScript
- monorepo
draft: false
---

The previous post covered [DI + Fake + in-memory basics]({{< ref "/post/di-fake-in-memory-testing" >}}). This one takes it further, into a scenario most testing tutorials ignore: **how frontend, backend, and shared logic can use the same Fake in a monorepo**.

> **Scope of this post**: **internal services** — classes you wrote, with interfaces you can swap. If the dependency is an **external HTTP API** (Stripe, GitHub, third-party SaaS), Fake isn't the right tool. See part three on [shared HTTP mocks]({{< ref "/post/monorepo-shared-http-mock" >}}) for that case.

The common approach is for the frontend to have its mocks, the backend its fixtures, and each package does its own thing. The result: the same service is mocked twice or three times, often with inconsistent behavior — the frontend test assumes `null`, the backend mock returns an empty array, and the bug only shows up at integration time.

## The Problem: Duplicated Mocks

Say a monorepo looks like this:

```
packages/
  ├── shared/        # shared TypeScript types
  ├── client/        # React frontend
  ├── server/        # API backend
  └── domain/        # business logic / data access
```

Client calls server APIs, server calls domain services, domain hits the database. All four packages need tests.

Each package writing its own mock:

```typescript
// client/__tests__/user-list.test.tsx
const mockApi = {
  fetchUsers: vi.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
};

// server/__tests__/users-route.test.ts
const mockUserService = {
  list: vi.fn().mockReturnValue([{ id: 1, name: 'Alice' }]),
};

// domain/__tests__/user-service.test.ts
const mockDb = {
  query: vi.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
};
```

Three layers, three copies, all describing "there's a user named Alice." Any change to the data shape means updating three places — and it's easy to miss one.

## Solution: Put the Fake in the Lowest Shared Package

The Fake belongs in the **lowest-level shared package**, so every package that needs it can import from the same source.

```
packages/
  ├── shared/
  │   ├── src/
  │   │   ├── types.ts        # shared types
  │   │   └── interfaces.ts   # service interfaces
  │   └── testing/            # shared test utilities
  │       ├── fake-user-service.ts
  │       ├── fake-storage-service.ts
  │       └── index.ts
```

Or extract a dedicated `test-utils` package for this. The key is that **every package imports the same copy**.

## Writing a Shared FakeUserService

Start from the bottom — the interface:

```typescript
// shared/src/interfaces.ts
export interface UserService {
  list(): Promise<User[]>;
  get(id: number): Promise<User | null>;
  create(user: Omit<User, 'id'>): Promise<User>;
  delete(id: number): Promise<void>;
}
```

And the Fake:

```typescript
// shared/testing/fake-user-service.ts
export class FakeUserService implements UserService {
  private users = new Map<number, User>();
  private nextId = 1;

  async list(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async get(id: number): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    const created = { ...user, id: this.nextId++ };
    this.users.set(created.id, created);
    return created;
  }

  async delete(id: number): Promise<void> {
    this.users.delete(id);
  }

  // test-only helpers
  seed(users: User[]): void {
    users.forEach((u) => this.users.set(u.id, u));
    const maxId = Math.max(...users.map((u) => u.id), 0);
    this.nextId = maxId + 1;
  }

  reset(): void {
    this.users.clear();
    this.nextId = 1;
  }
}
```

This Fake is about to be used by all three packages.

## Backend: Testing an API Route

```typescript
// server/src/users-route.ts
export function createUsersRoute(userService: UserService) {
  const router = new Router();

  router.get('/users', async (ctx) => {
    ctx.body = await userService.list();
  });

  router.post('/users', async (ctx) => {
    ctx.body = await userService.create(ctx.request.body);
  });

  return router;
}
```

Test:

```typescript
// server/src/__tests__/users-route.test.ts
import { FakeUserService } from '@app/shared/testing';

test('GET /users returns all users', async () => {
  const userService = new FakeUserService();
  userService.seed([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ]);

  const app = createApp(createUsersRoute(userService));
  const res = await request(app).get('/users');

  expect(res.body).toHaveLength(2);
});

test('POST /users creates a new user', async () => {
  const userService = new FakeUserService();

  const app = createApp(createUsersRoute(userService));
  await request(app).post('/users').send({ name: 'Charlie' });

  expect(await userService.get(1)).toEqual({ id: 1, name: 'Charlie' });
});
```

Using a full Fake makes the test read naturally: seed data → call the API → verify the Fake's final state. No `mockResolvedValue`, no `toHaveBeenCalledWith`.

## Frontend: Testing a React Component

The frontend uses the exact same `FakeUserService`:

```typescript
// client/src/user-list.tsx
export function UserList({ service }: { service: UserService }) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    service.list().then(setUsers);
  }, [service]);

  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}
```

Test:

```typescript
// client/src/__tests__/user-list.test.tsx
import { FakeUserService } from '@app/shared/testing';

test('renders list of users', async () => {
  const service = new FakeUserService();
  service.seed([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ]);

  render(<UserList service={service} />);

  expect(await screen.findByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
});
```

Identical `seed` API, identical behavior guarantees. Frontend and backend tests work with the same mental model.

## Business Logic: Composing Fakes

Domain services often depend on multiple Fakes:

```typescript
// domain/src/order-service.ts
export class OrderService {
  constructor(
    private userService: UserService,
    private storage: StorageService,
  ) {}

  async createOrder(userId: number, items: Item[]) {
    const user = await this.userService.get(userId);
    if (!user) throw new Error('User not found');

    const order = { id: Date.now(), userId, items };
    this.storage.set(`order:${order.id}`, order);
    return order;
  }
}
```

The test composes the two Fakes:

```typescript
test('creates order for existing user', async () => {
  const userService = new FakeUserService();
  const storage = new FakeStorageService();
  userService.seed([{ id: 1, name: 'Alice' }]);

  const orderService = new OrderService(userService, storage);
  const order = await orderService.createOrder(1, [{ sku: 'A', qty: 1 }]);

  expect(storage.get(`order:${order.id}`)).toEqual(order);
});

test('throws when user does not exist', async () => {
  const userService = new FakeUserService();
  const storage = new FakeStorageService();

  const orderService = new OrderService(userService, storage);

  await expect(orderService.createOrder(999, [])).rejects.toThrow('User not found');
});
```

Two Fakes snap together like Lego. The only difference from production is that the dependencies are Fake implementations.

## What This Pattern Gets You

**1. Behavioral consistency**

All three layers share one Fake, so behavior is guaranteed consistent. The frontend assumes "delete then get returns null" and the backend test uses the same behavior — no more "frontend mock returns null, backend mock returns undefined" drift.

**2. Lower maintenance cost**

Change the interface once, update the Fake once, and all three layers of tests pick up the new behavior automatically. No hunting for scattered mocks.

**3. Fakes are living documentation**

New team members want to know how `UserService` behaves? Reading `FakeUserService` is more useful than a pure interface — it has actual state transition logic.

**4. Integration tests fall out easily**

Need integration tests where client talks directly to server? Chain the Fakes together, no mock hierarchy redesign required.

## When Not to Share Fakes

The prerequisite for sharing a Fake is that **the dependency is that layer's public interface**. Internal details of a single layer don't belong in a shared package:

- HTTP middleware unique to the server → internal stubs are fine
- Context used only by one React hook → internal fixture
- Low-level database driver details → keep in domain

Rule of thumb: dependencies used by at least two packages get a shared Fake. Dependencies unique to one package stay put.

## Still Test the Fake Itself

Following on from the previous post: once a Fake lives in a shared package, testing it matters even more. Three layers depend on it — a bug pollutes the whole test foundation.

```typescript
// shared/testing/__tests__/fake-user-service.test.ts
describe('FakeUserService', () => {
  test('create assigns incrementing ids', async () => {
    const service = new FakeUserService();
    const a = await service.create({ name: 'Alice' });
    const b = await service.create({ name: 'Bob' });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
  });

  test('seed respects existing ids for nextId', async () => {
    const service = new FakeUserService();
    service.seed([{ id: 5, name: 'Old' }]);
    const next = await service.create({ name: 'New' });
    expect(next.id).toBe(6);
  });

  test('delete removes user', async () => {
    const service = new FakeUserService();
    service.seed([{ id: 1, name: 'Alice' }]);
    await service.delete(1);
    expect(await service.get(1)).toBeNull();
  });
});
```

These tests document the Fake's complete behavioral contract. Every client, server, and domain test rests on these validated invariants.

## Summary

The counterintuitive takeaway for monorepo testing: **don't let each package write its own mocks. Lift Fakes to the shared layer.**

The full workflow:

1. Define interfaces in the shared package
2. Put Fake implementations there too (`testing/` or a dedicated `test-utils`)
3. Frontend, backend, and business logic all import the same copy
4. Write tests for the Fake's own invariants
5. Compose Fakes to test complex service layers

Testing starts to feel like building with Lego — interfaces are connectors, Fakes are reusable blocks, and frontend and backend tests follow the same principle.

When the dependency is an external HTTP API (Stripe, GitHub, etc.), Fakes aren't the right tool — you need network-level interception instead. That's the subject of the next post: [sharing HTTP mocks across a monorepo]({{< ref "/post/monorepo-shared-http-mock" >}}).

## References

- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
- [Monorepo Tools — pnpm workspaces](https://pnpm.io/workspaces)
- [Vitest Documentation](https://vitest.dev/)
- [DI + Fake + in-memory testing foundations]({{< ref "/post/di-fake-in-memory-testing" >}})
- [Shared HTTP mocks across a monorepo]({{< ref "/post/monorepo-shared-http-mock" >}})
