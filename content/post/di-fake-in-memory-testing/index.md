---
title: 'DI + Fake + in-memory：寫出能長期維護的前端測試'
description: '介紹依賴注入、Fake 和 in-memory 實作三位一體的測試設計。用 FakeStorageService 的實例說明為什麼 Fake 比 Mock 好維護，以及怎麼寫一個可重用、可信賴的 in-memory Fake。'
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

寫測試時最常看到的 pattern 是這樣：

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

看起來沒問題，測試也會過。但這種寫法有個長期的問題：**測試綁死實作細節**。哪天 `UserService` 改用 `setItem` 而不是 `set`，或是多包一層 namespace，測試就炸。內部怎麼實作變動一次，測試改一次。

Fake + in-memory 可以避開這些陷阱。這篇整理三個概念怎麼搭配用：**DI（架構）+ Fake（pattern）+ in-memory（實作技法）**。

## 先搞清楚：為什麼需要 DI

依賴注入（Dependency Injection）的核心是「不要在 class 裡面 new 依賴」。這件事跟測試的關係是：**能不能抽換實作**。

沒用 DI：

```typescript
class UserService {
  save(user: User) {
    localStorage.setItem(`user:${user.id}`, JSON.stringify(user));
  }
}
```

測試時沒辦法換掉 `localStorage`，只能 spy on 全域物件，或是用 `vi.stubGlobal`。寫起來很醜，而且測試之間會污染。

有用 DI：

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

現在可以在測試時把 `localStorage` 換成任何東西——包括我們要講的 Fake。

DI 不需要框架，constructor 注入就夠用。前端框架（React、Vue）可以透過 context 或 provider 達到同樣目的。

## Mock 的問題

Mock 最大的問題是**每個測試都要自己組一份**。上面那段測試如果要新增「get 時回傳某個值」的場景：

```typescript
const mockStorage = {
  set: vi.fn(),
  get: vi.fn().mockImplementation((key) => {
    if (key === 'user:1') return JSON.stringify({ id: 1, name: 'Alice' });
    return null;
  }),
};
```

Mock 不知道 `set` 之後 `get` 應該能取到剛存的值——它沒有狀態。每個測試都要手動設定互動的順序和回傳值。

更糟的是**斷言綁在呼叫上**：`expect(mock.set).toHaveBeenCalledWith(...)`。這等於在驗證「內部呼叫了哪個方法」，而不是「外部觀察到什麼結果」。實作動一下，測試就掛。

## Fake 是什麼

Fake 是**一個真的實作**，只是簡化版的。它實作了跟 production 一樣的 interface，但用 in-memory 的方式儲存資料、跑邏輯。

```typescript
class FakeStorageService implements StorageService {
  private store = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get(key: string): unknown {
    return this.store.get(key) ?? null;
  }

  // 給測試用的輔助方法
  has(key: string): boolean {
    return this.store.has(key);
  }

  reset(): void {
    this.store.clear();
  }
}
```

Fake 的關鍵差異：

- **有狀態**：set 進去的東西 get 出來是同一個
- **可預測**：行為跟 production 一樣，不是每次測試自己編
- **可重用**：整個專案共用一份，不用每個測試重寫

## 用 Fake 重寫上面的測試

```typescript
test('saves user data', () => {
  const storage = new FakeStorageService();
  const service = new UserService(storage);

  service.save({ id: 1, name: 'Alice' });

  expect(storage.get('user:1')).toEqual({ id: 1, name: 'Alice' });
});
```

差異：

1. 不再 `expect(...).toHaveBeenCalledWith(...)`，改成斷言 storage 裡面**真的存在**預期的東西
2. 測的是行為（存完能取出來），不是實作（呼叫了 set 方法）
3. 如果 `UserService` 內部改用 `setItem` 或多包一層 namespace，只要 interface 沒變，這個測試就不會炸

## 寫好一個 in-memory Fake

Fake 的實作有幾個常見的設計點：

**1. 實作 production interface**

這是最重要的一條。Fake 必須跟 production 實作同一個 interface：

```typescript
class FakeStorageService implements StorageService { ... }
class LocalStorageService implements StorageService { ... }
```

這樣才能保證測試環境和實際跑的行為一致。沒有共同 interface 的 Fake 就是假的——你以為你在測系統，其實在測你自己想像中的系統。

**2. 提供測試用的 setup 方法**

Fake 可以有 production 沒有的方法，用來預先設定狀態：

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

這些輔助方法讓測試的 arrange 階段變得很乾淨：

```typescript
test('loads existing user', () => {
  const storage = new FakeStorageService();
  storage.seed({ 'user:1': { id: 1, name: 'Alice' } });

  const service = new UserService(storage);
  expect(service.load(1)).toEqual({ id: 1, name: 'Alice' });
});
```

**3. 有 reset 方法**

測試之間必須隔離。Fake 要提供 `reset()` 讓每個測試拿到乾淨狀態：

```typescript
beforeEach(() => {
  storage.reset();
});
```

或是每個測試重新建立 instance。後者更乾淨、不會忘記 reset。

> [!TIP]
> 如果你的測試框架支援 `beforeEach` 重建 instance，優先用這個做法——忘記呼叫 `reset()` 是隱形 bug，重建 instance 則不會漏。

## Fake 自己也要測

這是大部分人沒想過的一件事：**Fake 的行為必須被測試**。

Fake 在整個專案扮演「production 的替身」的角色，如果 Fake 自己行為有 bug，上面跑的所有測試都建立在錯誤基礎上。

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

這組測試的價值在於：**它描述了 Fake 的不變量（invariants）**。寫了這些測試後，Fake 被別的測試重用時才安心——它的行為是已知的。

## 什麼時候用 Fake，什麼時候用 Stub

Fake 不是萬能的。有些情況用 Stub（純回傳值）反而更合適：

**用 Fake 的場合**
- 依賴有狀態（storage、cache、database、session）
- 依賴的行為需要跨測試一致
- 依賴被多個測試共用
- 需要驗證「存進去能取出來」這類互動

**用 Stub 的場合**
- 依賴純粹是「給一個輸入拿一個輸出」
- 只被少數測試用到
- 每個測試需要的回傳值差異很大
- 實作 Fake 不划算（例如外部 API 的複雜回應）

實際上一個專案會混合用：共用服務寫 Fake，一次性的外部依賴用 Stub。

## 小結

整個流程串起來：

1. **用 DI 寫 production code**——constructor 注入依賴，不要在 class 裡 new
2. **定義 interface**——production 和測試的依賴都實作同一個
3. **寫 Fake**——in-memory 實作，加上測試用的 seed / reset 方法
4. **測試 Fake**——驗證 Fake 自己的不變量
5. **測試 production code**——用 Fake 當替身，斷言行為不是斷言呼叫

這個組合讓測試有三個長期優勢：不綁實作細節、跨測試狀態乾淨、Fake 本身被驗證過可信。

下一篇會講**在 monorepo 裡怎麼讓同一個 Fake 從前端測到後端共用**，這是這個 pattern 真正發光的地方。

## 系列後續

- [monorepo 跨層共用 Fake]({{< ref "/post/monorepo-shared-fake-testing" >}})——同一份 Fake 從前端測到後端
- [monorepo 跨層共用 HTTP mock]({{< ref "/post/monorepo-shared-http-mock" >}})——外部 API 用 MSW 補齊
- [AI agent 時代為什麼更需要好測試]({{< ref "/post/agent-friendly-testing" >}})——這套 pattern 對 Claude Code 的幫助

## 參考資源

- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
- [Mocks Aren't Stubs — Martin Fowler](https://martinfowler.com/articles/mocksArentStubs.html)
- [Vitest 官方文件](https://vitest.dev/)
- [Dependency Injection — Martin Fowler](https://martinfowler.com/articles/injection.html)
