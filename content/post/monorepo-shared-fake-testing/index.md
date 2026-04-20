---
title: 'Monorepo 跨層共用 Fake：一份測試替身從前端用到後端'
description: '在 monorepo 裡，前端、後端、業務邏輯各寫一套 mock 是重複勞動且容易行為不一致。這篇示範怎麼設計共用的 Fake，讓同一份測試替身從 React component 測到 API route 再到 service layer。'
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

前一篇文章[介紹了 DI + Fake + in-memory 的基本寫法]({{< ref "/post/di-fake-in-memory-testing" >}})。這篇進一步，講一個大部分測試教學不會提的情境：**monorepo 裡前端、後端、共用邏輯怎麼共用同一份 Fake**。

> **這篇的範圍**：**內部 service**（你自己寫的 class、有 interface 可以抽換）。如果依賴是**外部 HTTP API**（Stripe、GitHub、第三方 SaaS），Fake 不是對的工具，請看第三篇[跨層共用 HTTP mock]({{< ref "/post/monorepo-shared-http-mock" >}})。

常見的做法是前端有前端的 mock，後端有後端的 fixture，各做各的。結果就是同一個服務被 mock 兩次、三次，行為還不一定一致——前端測試以為回 null，後端 mock 卻回空陣列，bug 只在整合時才跑出來。

## 問題：重複的 Mock

假設 monorepo 有這個結構：

```
packages/
  ├── shared/        # TypeScript 共用型別
  ├── client/        # React 前端
  ├── server/        # API 後端
  └── domain/        # 業務邏輯 / 資料存取
```

client 會呼叫 server 的 API，server 呼叫 domain 的 service，domain 碰資料庫。四個 package 都要測試。

如果每個 package 自己寫 mock：

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

三層各一份，而且都寫了「有一個 Alice 的假資料」。任何資料結構變動，要改三個地方——而且很容易忘掉其中一個。

## 解法：Fake 放在最底層 package

Fake 應該放在**被共用的最底層 package**，讓所有需要用到它的 package 都可以 import。

```
packages/
  ├── shared/
  │   ├── src/
  │   │   ├── types.ts        # 共用型別
  │   │   └── interfaces.ts   # service interface
  │   └── testing/            # 共用測試工具
  │       ├── fake-user-service.ts
  │       ├── fake-storage-service.ts
  │       └── index.ts
```

或者抽一個獨立的 `test-utils` package 放這些東西。關鍵是**所有 package 都 import 同一份**。

## 寫一個共用的 FakeUserService

從最底層 interface 開始：

```typescript
// shared/src/interfaces.ts
export interface UserService {
  list(): Promise<User[]>;
  get(id: number): Promise<User | null>;
  create(user: Omit<User, 'id'>): Promise<User>;
  delete(id: number): Promise<void>;
}
```

對應的 Fake：

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

  // 測試用輔助方法
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

這個 Fake 接下來三個 package 都會用到。

## 後端怎麼用：測試 API route

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

測試：

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

用 Fake 完整實作，測試自然讀：seed 資料 → 呼叫 API → 驗證 Fake 的最終狀態。沒有 `mockResolvedValue`、沒有 `toHaveBeenCalledWith`。

## 前端怎麼用：測試 React component

前端也可以直接用同一個 `FakeUserService`：

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

測試：

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

完全一樣的 `seed` 寫法、完全一樣的行為保證。前後端的測試可以用同一個心智模型思考。

## 業務邏輯怎麼用：組合 Fake

domain 層可能有更複雜的 service，依賴其他 Fake：

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

測試時把兩個 Fake 組起來：

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

兩個 Fake 像樂高一樣組合。跟 production 的差別只在依賴是 Fake 實作。

## 這個 pattern 帶來的紅利

**1. 行為一致性**

三層共用同一個 Fake，行為保證一致。前端假設「delete 後 get 回 null」，後端測試也是同一個行為，不會有「前端 mock 回 null，後端 mock 回 undefined」的差異。

**2. 維護成本下降**

interface 改一次，Fake 跟著改一次，三層的測試自動適用新行為。不用每個 package 搜 mock 改一遍。

**3. Fake 是活文件**

新人想知道 `UserService` 的行為？看 `FakeUserService` 的實作比看純 interface 有用太多——它有具體的狀態轉換邏輯。

**4. 整合測試容易**

需要寫整合測試（例如 client 直接打 server）時，把 Fake 串起來就好，不用重新設計 mock 階層。

## 什麼時候不要用共用 Fake

Fake 共用的前提是**依賴是該層的公共介面**。如果是某一層的內部細節，就不該抽到共用 package：

- server 獨有的 HTTP 中介層 → server 內部的 stub 就好
- 只給某個 React hook 用的 context → client 內部的 fixture
- 資料庫 driver 的低層細節 → domain 內部

原則：能被至少兩個 package 用到的依賴，Fake 抽到共用層。一個 package 獨享的依賴，Fake 留在原地。

## Fake 自己也要測

承上一篇提過的：Fake 放到共用 package 後更要測。它被三層共用，有 bug 會污染整個測試基礎。

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

這組測試記錄了 Fake 的完整行為契約。client、server、domain 的測試全部建立在這些驗證過的不變量上。

## 小結

在 monorepo 做測試的反直覺結論：**不要讓每個 package 自己 mock，把 Fake 抽到共用層**。

整個作法的步驟：

1. interface 定義在共用 package
2. Fake 實作也放在共用 package（`testing/` 或獨立 `test-utils`）
3. 前端、後端、業務邏輯都 import 同一份
4. Fake 自己寫一組測試驗證不變量
5. 用 Fake 組合測試複雜的 service layer

測試寫起來像組樂高——interface 是接口，Fake 是可重用的積木，前後端的測試都是同一套原則。

如果你的依賴是外部 HTTP API（Stripe、GitHub 這類），Fake 就不是對的工具，需要的是網路層攔截——下一篇講[跨層共用 HTTP mock]({{< ref "/post/monorepo-shared-http-mock" >}})。

## 參考資源

- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
- [Monorepo Tools — pnpm workspaces](https://pnpm.io/workspaces)
- [Vitest 官方文件](https://vitest.dev/)
- [DI + Fake + in-memory 測試基礎]({{< ref "/post/di-fake-in-memory-testing" >}})
- [monorepo 跨層共用 HTTP mock]({{< ref "/post/monorepo-shared-http-mock" >}})
