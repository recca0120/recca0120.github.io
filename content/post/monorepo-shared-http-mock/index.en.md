---
title: 'Shared HTTP Mocks Across a Monorepo: When Fakes Aren''t the Right Tool'
description: 'The previous two posts covered Fakes for internal services — but external HTTP APIs don''t fit that pattern. This post shows how to share HTTP mocks across frontend and backend in a monorepo using MSW / msw-fetch-mock, complementing the Fake approach.'
slug: monorepo-shared-http-mock
date: '2026-04-20T07:45:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- MSW
- Vitest
- TypeScript
- monorepo
draft: false
---

The previous posts covered [DI + Fake + in-memory]({{< ref "/post/di-fake-in-memory-testing" >}}) and [sharing Fakes across a monorepo]({{< ref "/post/monorepo-shared-fake-testing" >}}). That approach has one scope limit: **services you own**.

When the dependency is an **external HTTP API** (Stripe, GitHub, third-party SaaS), Fake isn't the right tool. This post covers how to apply the same "share across layers" philosophy to HTTP mocks instead.

## Why External HTTP Doesn't Fit the Fake Pattern

The `FakeUserService` from the last post works because:

- You own `UserService`'s interface and implementation
- You know its behavioral invariants
- The Fake shares the same interface as production

External HTTP APIs fail all three conditions:

- The "interface" is someone else's REST/GraphQL endpoint — out of your control
- Behavior changes without warning
- Production uses `fetch` + network; you can't swap in a Fake class

Forcing a Fake becomes a maintenance nightmare: Stripe changes its response shape, `FakeStripeService` doesn't follow, tests stay green while production breaks.

## The Right Substitution Point: The Network Layer

For external HTTP, substitution happens at **the HTTP call itself**, not at some service interface. Intercept `fetch` / `http.request` and return fake responses.

That's what [MSW](https://mswjs.io) / [msw-fetch-mock]({{< ref "/post/msw-fetch-mock" >}}) do:

- Production code is unchanged (still calls `fetch(...)`)
- Tests intercept network requests and return the fake response you define
- After tests, things return to normal

Compared to Fakes:

| | Fake (internal) | HTTP mock (external) |
|---|---|---|
| Substitution point | interface | network layer |
| Needs DI | yes | no |
| Test setup | inject the Fake | start a mock server |
| Production changes | interface can change | `fetch` calls unchanged |

## The Sharing Challenge

Frontend and backend both call external APIs. Both need HTTP mocking.

Common wrong approach:

**Frontend uses `vi.spyOn(global, 'fetch')`**
```typescript
vi.spyOn(global, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ data: 'fake' }))
);
```

**Backend uses nock**
```typescript
nock('https://api.stripe.com').get('/v1/customers').reply(200, { data: 'fake' });
```

Two different APIs, two different behaviors — same external API, two mock implementations. As much of a mess as mock proliferation.

## The Fix: Share the Same Handler Set

Same philosophy as Fakes — **put HTTP mock handlers in a shared package**, and every layer's tests import the same set.

MSW supports this natively:

```typescript
// shared/testing/stripe-handlers.ts
import { http, HttpResponse } from 'msw';

export const stripeHandlers = [
  http.get('https://api.stripe.com/v1/customers/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Test Customer',
      email: 'test@example.com',
    });
  }),

  http.post('https://api.stripe.com/v1/customers', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 'cus_123', ...body }, { status: 201 });
  }),
];
```

This handler set feeds both frontend and backend tests.

## Backend Usage

Node.js uses `setupServer`:

```typescript
// server/src/__tests__/billing.test.ts
import { setupServer } from 'msw/node';
import { stripeHandlers } from '@app/shared/testing';

const server = setupServer(...stripeHandlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('creates customer via Stripe API', async () => {
  const billing = new BillingService();
  const customer = await billing.createCustomer({ name: 'Alice' });

  expect(customer.id).toBe('cus_123');
});
```

The `fetch('https://api.stripe.com/...')` inside `BillingService` is transparently intercepted by MSW. Production code needs zero test-aware changes.

## Frontend Usage

Browser environments use Service Worker — but Vitest also works fine with the Node version:

```typescript
// client/src/__tests__/checkout.test.tsx
import { setupServer } from 'msw/node';
import { stripeHandlers } from '@app/shared/testing';

const server = setupServer(...stripeHandlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('shows customer name after creation', async () => {
  render(<CheckoutForm />);
  fireEvent.click(screen.getByText('Create'));

  expect(await screen.findByText('Test Customer')).toBeInTheDocument();
});
```

Same `stripeHandlers`, works on both sides.

## Customizing Responses: Testing Edge Cases

The shared handlers cover the happy path. Special cases get layered on with `server.use()`:

```typescript
import { http, HttpResponse } from 'msw';

test('handles Stripe API error', async () => {
  server.use(
    http.post('https://api.stripe.com/v1/customers', () => {
      return HttpResponse.json(
        { error: { message: 'Card declined' } },
        { status: 402 }
      );
    })
  );

  const billing = new BillingService();
  await expect(billing.createCustomer({ name: 'Bob' })).rejects.toThrow('Card declined');
});
```

`server.use()` is temporary — `resetHandlers()` returns to the shared handlers.

## MSW's API Too Verbose? Try msw-fetch-mock

MSW's native API writes one handler per endpoint, which can be verbose in tests. If you want features like `times(n)`, `persist()`, `assertNoPendingInterceptors()`, use [msw-fetch-mock]({{< ref "/post/msw-fetch-mock" >}}) — it sits on top of MSW with an API aligned to undici `MockAgent` and Cloudflare Workers `fetchMock`:

```typescript
import { fetchMock } from 'msw-fetch-mock';

beforeAll(() => fetchMock.activate({ onUnhandledRequest: 'error' }));
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});

test('creates customer', async () => {
  fetchMock.get('https://api.stripe.com')
    .intercept({ path: '/v1/customers', method: 'POST' })
    .reply(201, { id: 'cus_123' });

  const billing = new BillingService();
  const customer = await billing.createCustomer({ name: 'Alice' });

  expect(customer.id).toBe('cus_123');
});
```

Full API reference and comparison with other mocking libraries in the earlier [msw-fetch-mock overview]({{< ref "/post/msw-fetch-mock" >}}).

## Why the Sharing Pattern Differs

Fakes and HTTP mocks solve two sides of the same problem:

**Fakes share**: **interface + in-memory implementation**
Frontend and backend both import the `FakeUserService` class, plug it into a constructor.

**HTTP mocks share**: **request handler lists**
Frontend and backend both import the `stripeHandlers` array, feed it to an MSW server.

One can't replace the other:

- Forcing HTTP mocks on internal services adds unnecessary network — production is a direct function call, why wrap it in HTTP just to mock
- Forcing Fakes on external APIs reimplements someone else's service by hand — behavior can never stay in sync

You need both.

## The Complete Monorepo Testing Strategy

Combining all three posts, a mature monorepo testing architecture looks like this:

```
packages/
  └── shared/
      └── testing/
          ├── fakes/              # Fakes for internal services
          │   ├── fake-user-service.ts
          │   └── fake-storage-service.ts
          ├── http-handlers/      # MSW handlers for external APIs
          │   ├── stripe-handlers.ts
          │   └── github-handlers.ts
          └── index.ts
```

- Internal services → Fakes (previous two posts)
- External HTTP APIs → MSW handlers (this post)
- Every layer imports what it needs

Tests look consistent across layers:

```typescript
import { FakeUserService } from '@app/shared/testing';
import { stripeHandlers } from '@app/shared/testing';
import { setupServer } from 'msw/node';

const server = setupServer(...stripeHandlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('creates user and customer', async () => {
  const userService = new FakeUserService();
  const service = new SignupService(userService);

  await service.signup({ name: 'Alice' });

  expect(await userService.get(1)).toBeDefined();   // internal: Fake state
  // Stripe call is intercepted by MSW and returns fake data (external HTTP)
});
```

## When Neither Applies

A few rare cases neither fits:

- **Real API integration tests** (contract testing, verifying Stripe's actual behavior) — don't mock, use the sandbox environment
- **Pure function testing** (no external dependencies) — just pass arguments

The rule: mocks/fakes isolate "things not under test." They're not an excuse to hide dependencies.

## Summary

The complete test-double strategy for a monorepo:

| Dependency type | Tool | Shared location |
|---|---|---|
| Internal service (stateful) | Fake | `shared/testing/fakes/` |
| Internal service (pure functions) | Stub | inside the package |
| External HTTP API | MSW handlers | `shared/testing/http-handlers/` |
| Real contract verification | Don't mock — use sandbox | N/A |

The central claim of this three-post series: **test doubles should be shared infrastructure across layers, not boilerplate re-written in every file**. Fake and MSW answer at different layers, but the thinking is the same — write once, share, test behavior not implementation.

## References

- [DI + Fake + in-memory testing foundations]({{< ref "/post/di-fake-in-memory-testing" >}})
- [Sharing Fakes across a monorepo]({{< ref "/post/monorepo-shared-fake-testing" >}})
- [msw-fetch-mock overview and comparison]({{< ref "/post/msw-fetch-mock" >}})
- [Why AI agents need good tests even more]({{< ref "/post/agent-friendly-testing" >}})
- [MSW Documentation](https://mswjs.io/)
- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
