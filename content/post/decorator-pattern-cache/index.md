---
title: 'AI 幫你加了快取，但它悄悄污染了商業邏輯——用裝飾者模式根治這個問題'
description: '分析 AI 寫程式時把快取邏輯嵌入 production code 的常見模式，以及為什麼「另開一個 class」不夠，用裝飾者模式才能真正把快取與商業邏輯切乾淨。'
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

請 AI 幫你加快取，它確實加了。程式碼跑得動，也有職責分離的意思——快取邏輯被抽進了另一個 class。但如果你仔細看 `UserService` 或 `OrderRepository`，你會發現裡面多了一個 cache 的依賴，多了幾行 if/else，多了一段「先查快取、沒有就查 DB、再寫回快取」的流程。

快取的邏輯確實被移走了，但它還是從外面爬進來，黏在了你的商業邏輯身上。

## AI 典型的做法：快取包在服務裡

假設你有一個 `UserRepository`，AI 收到「加快取」的需求之後，最常見的輸出長這樣：

```typescript
class UserRepository {
  constructor(
    private db: Database,
    private cache: Cache  // 多了這個依賴
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

從技術上看，這段程式碼沒有問題。但 `UserRepository` 現在同時負責兩件事：知道怎麼查資料庫，以及知道怎麼用快取。這兩件事放在同一個 class 裡，測試的時候你要 mock 兩個依賴，快取策略一改就要動這個 class，而且任何需要 `UserRepository` 的地方都強制帶著快取的知識。

## AI 知道「職責分離」，但仍然逃不掉

如果你跟 AI 說「職責要分離，不要把快取邏輯放進 Repository」，它通常會拆出一個 `CachedUserRepository`：

```typescript
class UserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User> {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id])
  }
}

class CachedUserRepository {
  constructor(
    private repo: UserRepository,  // 依賴具體實作，不是介面
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

`UserRepository` 確實乾淨了。但問題跑到了呼叫端：你的 `UserService` 到底要用 `UserRepository` 還是 `CachedUserRepository`？如果要用帶快取的版本，呼叫端就必須明確知道有這個「有快取的版本」存在——這份知識不應該由使用方來負擔。

更麻煩的是，`CachedUserRepository` 依賴的是具體的 `UserRepository`，不是介面。換一個資料來源、加一個 mock，`CachedUserRepository` 也跟著要改。

## 裝飾者模式：讓快取對使用方完全透明

正確的做法是先定義介面，再用裝飾者實作快取層：

```typescript
// 1. 定義介面，這是唯一的契約
interface IUserRepository {
  findById(id: string): Promise<User>
  findAll(): Promise<User[]>
}

// 2. 核心實作只負責資料存取，完全不知道快取的存在
class UserRepository implements IUserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User> {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id])
  }

  async findAll(): Promise<User[]> {
    return this.db.query('SELECT * FROM users')
  }
}

// 3. 裝飾者也實作同一個介面，接受任何 IUserRepository
class CachedUserRepository implements IUserRepository {
  constructor(
    private inner: IUserRepository,  // 依賴介面，不是具體實作
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

組合的方式：

```typescript
// 在 DI container 或 composition root 裡組裝
const userRepository: IUserRepository = new CachedUserRepository(
  new UserRepository(db),
  cache
)
```

`UserService` 只需要接收 `IUserRepository`，完全不知道背後有沒有快取：

```typescript
class UserService {
  constructor(private users: IUserRepository) {}  // 只知道介面

  async getUser(id: string): Promise<User> {
    return this.users.findById(id)
  }
}
```

快取存不存在、用哪種快取策略，`UserService` 一概不知道，也不需要知道。

## 這樣拆開之後，測試也清楚很多

`UserRepository` 的測試只需要一個 DB 連線或 DB mock：

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

`CachedUserRepository` 的測試只需要 mock `IUserRepository` 和 `Cache`，完全不碰 DB：

```typescript
describe('CachedUserRepository', () => {
  it('should return cached result without hitting inner repo', async () => {
    const inner = { findById: vi.fn(), findAll: vi.fn() }
    const cache = createMockCache({ 'user:1': JSON.stringify({ id: '1', name: 'Alice' }) })
    const repo = new CachedUserRepository(inner, cache)

    const user = await repo.findById('1')
    expect(inner.findById).not.toHaveBeenCalled()  // 快取命中，沒打到 inner
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

兩個 class、兩組獨立測試，每組只負責自己那一層的邏輯。

## 為什麼 AI 很難自己做到這件事

AI 在收到「加快取」的需求時，訓練資料裡最常出現的模式就是「在原本的方法裡加 cache check」，這是最短路徑，也是最常見的 tutorial 寫法。

就算你在 skill 或 prompt 裡寫了「職責分離」的規則，AI 通常會把規則解讀成「把快取邏輯移到另一個 class」——但這個 class 仍然是一個知道特定資料來源的 wrapper，不是一個可以替換的裝飾者。

真正的裝飾者模式需要先想好介面的邊界在哪裡，再決定哪些行為應該被包在外層。這個設計決策發生在寫程式之前，而 AI 沒有辦法在沒有明確指令的情況下替你做這個決定。

## 同樣的模式也適用於其他橫切關注點

快取只是其中一個例子。Logging、retry、rate limiting、telemetry——這些都是橫切關注點（cross-cutting concerns），都可以用同樣的方式處理：

```typescript
// Logging 裝飾者
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

// 可以疊加多層裝飾者
const repo: IUserRepository = new LoggingUserRepository(
  new CachedUserRepository(
    new UserRepository(db),
    cache
  ),
  logger
)
```

每一層只做一件事，可以自由組合，使用方從頭到尾只看到 `IUserRepository`。

## 小結

AI 會幫你寫快取，但它寫出來的東西通常是往商業邏輯裡塞依賴，或者換一個地方繼續耦合。

解法不複雜：先定介面，讓快取層以裝飾者的形式包在外面，商業邏輯完全不動。這樣測試獨立、策略可換、使用方零負擔。

下次請 AI 加快取之前，先自己想清楚介面是什麼，再讓它填實作——這才是比較不會踩坑的工作方式。

## 參考資源

- [Keeping cross-cutting concerns out of application code — Mark Seemann](https://blog.ploeh.dk/2024/09/02/keeping-cross-cutting-concerns-out-of-application-code/)
- [Decorator Pattern in .NET: Add Caching, Logging, and More — Medium](https://medium.com/@thecodeman/decorator-pattern-in-net-explained-add-caching-logging-and-more-with-ease-cae51d4bd6de)
- [Decorator Design Pattern — DevIQ](https://deviq.com/design-patterns/decorator-pattern/)
- [AI-Generated Code Quality Crisis — Kunal Ganglani](https://www.kunalganglani.com/blog/ai-generated-code-quality-crisis)
