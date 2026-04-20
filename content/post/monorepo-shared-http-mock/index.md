---
title: 'Monorepo 跨層共用 HTTP Mock：外部 API 不適合用 Fake 時的方案'
description: '前兩篇講了用 Fake 處理內部 service，但外部 HTTP API 不適用這套。介紹怎麼在 monorepo 裡用 MSW / msw-fetch-mock 做同一份 HTTP mock 從前端測到後端，與 Fake 互補。'
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

前兩篇講了 [DI + Fake + in-memory]({{< ref "/post/di-fake-in-memory-testing" >}}) 和[在 monorepo 裡跨層共用 Fake]({{< ref "/post/monorepo-shared-fake-testing" >}})。這套方法有一個適用範圍：**你自己寫的 service**。

如果依賴是**外部 HTTP API**（Stripe、GitHub、第三方 SaaS），Fake 不是對的工具。這篇講這種情境怎麼用同樣的「跨層共用」精神做 HTTP mock。

## 為什麼外部 HTTP 不適合寫 Fake

上一篇的 `FakeUserService` 成立的前提是：

- 你擁有 `UserService` 的 interface 和實作
- 你知道它的行為不變量
- Fake 實作跟 production 實作共用同一個 interface

外部 HTTP API 三個條件都不成立：

- interface 是別人家的 REST / GraphQL endpoint，你動不了
- 行為變動不會通知你
- production 實作是 `fetch` + network，你沒辦法用 Fake class 替代

硬寫 Fake 變成維護地獄：Stripe 改 response 結構，你的 `FakeStripeService` 不會自動跟上，測試綠但 production 炸。

## 正確的抽換位置：網路層

外部 HTTP 的抽換點不在「service 介面」，而在 **HTTP 呼叫本身**。攔截 `fetch` / `http.request`，回假 response。

這就是 [MSW](https://mswjs.io) / [msw-fetch-mock]({{< ref "/post/msw-fetch-mock" >}}) 這類工具在做的事：

- Production code 不動（還是照樣 `fetch(...)`）
- 測試環境攔截網路請求，回你設定的假 response
- 測試跑完恢復

跟 Fake 的差異：

| | Fake（內部） | HTTP mock（外部） |
|---|---|---|
| 抽換點 | interface | 網路層 |
| 需要 DI | 需要 | 不需要 |
| 測試寫法 | 注入 Fake | 啟動 mock server |
| Production 改動 | interface 可改 | fetch 呼叫照舊 |

## 跨層共用的挑戰

前端和後端都會打外部 API，兩邊測試都要 mock 這些請求。

常見的錯誤做法：

**前端用 `vi.spyOn(global, 'fetch')`**
```typescript
vi.spyOn(global, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ data: 'fake' }))
);
```

**後端用 nock**
```typescript
nock('https://api.stripe.com').get('/v1/customers').reply(200, { data: 'fake' });
```

兩邊 API 不同、行為不同，一樣的外部 API 要寫兩套 mock。維護起來跟 mock 氾濫一樣慘。

## 解法：同一份 mock handler 跨層共用

跟 Fake 共用的思路一樣——**把 HTTP mock handler 放在共用 package**，前端、後端、整合測試都 import 同一份。

MSW 原生就支援這件事：

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

這份 handler 可以同時餵給前端和後端的測試。

## 後端怎麼用

Node.js 環境用 `setupServer`：

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

`BillingService` 裡面的 `fetch('https://api.stripe.com/...')` 直接被 MSW 攔截。production code 完全不用為了測試做任何調整。

## 前端怎麼用

Browser 環境用 Service Worker：

```typescript
// client/src/__tests__/checkout.test.tsx
import { setupServer } from 'msw/node'; // Vitest 也能用 node 版
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

一樣的 `stripeHandlers`，前端後端都能用。

## 客製化 response：測試邊界情況

共用 handlers 是 happy path，特殊情境用 `server.use()` 疊加：

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

`server.use()` 是暫時的，`resetHandlers()` 之後回到 shared handlers。

## MSW 的 API 太囉嗦？用 msw-fetch-mock

MSW 的原生 API 每個 endpoint 要寫一個 handler，測試比較冗。如果你想要 `times(n)`、`persist()`、`assertNoPendingInterceptors()` 這些測試生命週期功能，可以用 [msw-fetch-mock]({{< ref "/post/msw-fetch-mock" >}})——底層還是 MSW，API 風格對齊 undici `MockAgent` 和 Cloudflare Workers `fetchMock`：

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

詳細的 API 和跟其他方案的比較，之前寫過一篇[msw-fetch-mock 完整介紹]({{< ref "/post/msw-fetch-mock" >}})。

## 為什麼一樣是共用，但 pattern 不同

Fake 和 HTTP mock 解的是同一個問題的兩個面向：

**Fake 共用的是**：**interface + in-memory 實作**
前端、後端都 import 同一個 `FakeUserService` class，直接塞進 constructor。

**HTTP mock 共用的是**：**request handler 列表**
前端、後端都 import 同一個 `stripeHandlers` 陣列，塞進 MSW server。

一個 pattern 不能替代另一個：

- 內部 service 硬用 HTTP mock 等於繞一圈——production 明明是直接 function call，為什麼要先包成 HTTP 再 mock
- 外部 API 硬寫 Fake 等於重新實作別人家的 API——行為同步不了

兩個一起用才完整。

## 完整的 monorepo 測試策略

把前兩篇 + 這篇整合起來，一個成熟的 monorepo 測試架構長這樣：

```
packages/
  └── shared/
      └── testing/
          ├── fakes/              # 內部 service 的 Fake
          │   ├── fake-user-service.ts
          │   └── fake-storage-service.ts
          ├── http-handlers/      # 外部 API 的 MSW handlers
          │   ├── stripe-handlers.ts
          │   └── github-handlers.ts
          └── index.ts
```

- 內部 service → Fake（前兩篇）
- 外部 HTTP API → MSW handlers（這篇）
- 前端、後端、業務邏輯各自依需求 import

測試寫起來三層一致：

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

  expect(await userService.get(1)).toBeDefined();   // 內部：Fake 狀態
  // Stripe 的呼叫被 MSW 攔下並回假資料（外部 HTTP）
});
```

## 什麼時候兩個都不用

有極少數情況兩個都不適合：

- **真的需要打到 real API 的整合測試**（例如 contract test，驗證 Stripe 真實行為）——那就別 mock，用 sandbox 環境
- **測試純 function**（純輸入輸出、無外部依賴）——直接傳參數

原則：mock/fake 是為了隔離「不是你正在測的東西」，不是為了掩蓋依賴。

## 小結

完整的 monorepo 測試替身策略：

| 依賴類型 | 工具 | 共用位置 |
|---------|------|---------|
| 內部 service（有狀態） | Fake | `shared/testing/fakes/` |
| 內部 service（純函式） | Stub | package 內部 |
| 外部 HTTP API | MSW handlers | `shared/testing/http-handlers/` |
| 真實契約驗證 | 不 mock，打 sandbox | N/A |

三篇系列文的核心主張：**測試替身應該是跨層共用的基礎設施，不是每個檔案重寫一遍的樣板**。Fake 跟 MSW 是不同層的答案，但思路一致——寫一次、共用、測行為不測實作。

## 參考資源

- [DI + Fake + in-memory 測試基礎]({{< ref "/post/di-fake-in-memory-testing" >}})
- [monorepo 跨層共用 Fake]({{< ref "/post/monorepo-shared-fake-testing" >}})
- [msw-fetch-mock 完整介紹與方案比較]({{< ref "/post/msw-fetch-mock" >}})
- [AI agent 時代為什麼更需要好測試]({{< ref "/post/agent-friendly-testing" >}})
- [MSW 官方文件](https://mswjs.io/)
- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
