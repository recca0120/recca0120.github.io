---
title: '用 memfs + FakeWatchService 測試檔案系統：不碰磁碟的 Node.js 測試策略'
description: '實際拆解一個 FileService 的測試，說明如何用 memfs 替換 fs、手寫 Fake 替換 chokidar，讓檔案系統測試跑得快、結果穩、安全性有保障。'
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

一個操作檔案系統的 Node.js service，測試該怎麼寫？直覺想到的做法是在 `/tmp` 底下建真實檔案、跑完再刪掉。但這樣有幾個問題：速度慢、跨平台行為不一致、CI 環境的權限可能不同、而且 file watcher 的事件時機根本不可控。

這篇用一個 `FileService` 來當範例，看它怎麼用 [memfs](https://github.com/streamich/memfs) 和手寫的 FakeWatchService 把這些問題全部解掉。

## 被測對象長什麼樣

`FileService` 實作了 `IFileService` 介面，負責瀏覽目錄、列出檔案（含 fuzzy search）、讀寫檔案、以及 CRUD 操作。它有兩個可注入的外部依賴：

```typescript
export class FileService implements IFileService {
  constructor(
    private readonly roots: readonly string[],
    private readonly watch?: WatchService,
    private readonly fsImpl?: typeof import('node:fs'),
  ) {}
}
```

- `roots`：允許操作的根目錄清單
- `watch`：可選的 `WatchService`，用來監聽檔案變化、失效快取
- `fsImpl`：可選的 `fs` 模組實作，給 `glob` 用

這三個參數都透過 constructor injection 傳入，production 用真實的，測試用假的。這是整個測試策略的基礎。

## 用 memfs 替換真實檔案系統

測試的第一步是把 `node:fs` 和 `node:fs/promises` 整個換掉：

```typescript
import { vol, fs as memfs } from 'memfs';
import { FileService } from './file-service';

vi.mock('node:fs', async () => (await import('memfs')).fs);
vi.mock('node:fs/promises', async () => (await import('memfs')).fs.promises);
```

[memfs](https://github.com/streamich/memfs) 是一個完全在記憶體裡運作的 `fs` 實作。API 跟 Node.js 原生的 `fs` 一模一樣，但所有操作都在記憶體裡完成，不碰磁碟。

`vi.mock` 的 factory function 裡用 dynamic import 是 Vitest 的限制，但實際使用 `vol` 和 `memfs` 時都是 top-level import。

每個測試開始前，用 `vol.fromJSON()` 宣告式地建立需要的檔案結構：

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

這帶來幾個好處：

- **速度**：記憶體操作，沒有磁碟 I/O
- **隔離**：`vol.reset()` 一呼叫就是全新的檔案系統，測試之間完全不干擾
- **可讀**：從 JSON 就能看到整個檔案結構，不用去翻 fixture 目錄
- **跨平台**：不用煩惱 Windows 的路徑分隔符或 `/tmp` 的權限

## 用 FakeWatchService 替換 chokidar

`FileService` 內部有一層快取機制：第一次呼叫 `listFiles()` 時走 glob 掃描整個目錄樹，結果存進內部快取。之後的呼叫直接回傳快取，直到收到 `WatchService` 的檔案變化事件才失效重建。

真實環境用 chokidar 監聽檔案變化，但 chokidar 的事件是非同步的、時機不確定。在測試裡沒辦法精確控制「現在應該觸發一個事件」。

解法是寫一個 Fake：

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

這不是 mock，是一個有完整行為的 Fake。它真的管理訂閱者、真的執行取消訂閱、真的把事件分發給所有 callback。唯一的差別是事件來源從「OS 的 inotify/FSEvents」變成「測試程式碼呼叫 `simulate()`」。

> 關於 Fake 和 Mock 的差別，可以參考 [DI + Fake + in-memory：寫出能長期維護的前端測試]({{< ref "/post/di-fake-in-memory-testing" >}})。

## 快取機制的三個測試場景

有了 FakeWatchService，快取的行為就能精確驗證了。

**場景一：沒有事件 → 快取命中**

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

第二次呼叫之前，雖然用 `vol.writeFileSync` 新增了檔案，但沒有觸發 watch 事件，所以快取不會失效。新檔案不會出現在結果裡。

**場景二：有事件 → 快取失效**

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

呼叫 `watch.simulate()` 之後，快取被清掉，下次 `listFiles()` 重新掃描，就能看到新檔案了。

**場景三：並發呼叫只訂閱一次**

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

兩個 `listFiles()` 同時發起，但只應該訂閱一次 watcher。這驗證了 `inflight promise` 的 dedup 機制有正確運作。

這三個場景如果用真實的 chokidar 來測，幾乎不可能寫出穩定的斷言。事件什麼時候到、到幾次，都不是測試能控制的。

## 安全性測試不是事後補的

整份測試裡，安全相關的斷言散布在各個 `describe` 區塊：

```typescript
// browseDirectories 過濾隱藏目錄
it('filters hidden directories', async () => {
  const names = (await service.browseDirectories(ROOT))
    .map((d: DirEntry) => d.name);
  expect(names).not.toContain('.hidden');
  expect(names).not.toContain('.git');
});

// readFile 擋 path traversal
it('rejects path traversal', async () => {
  expect(await service.readFile(ROOT, '../../etc/passwd')).toEqual({
    error: 'Path traversal not allowed',
  });
});

// browseDirectories 擋路徑穿越
it('returns empty for path traversal', async () => {
  expect(await service.browseDirectories(`${ROOT}/../../etc`)).toEqual([]);
});

// 所有 mutation 操作都擋 root 外的路徑
it('all mutations reject paths outside allowed roots', async () => {
  expect(await svc.create('/etc/passwd-clone', 'file'))
    .toMatchObject({ error: expect.any(String) });
  expect(await svc.delete('/etc/passwd'))
    .toMatchObject({ error: expect.any(String) });
  // rename, copy, move 同理...
});
```

這些不是獨立的「安全測試套件」，而是跟功能測試放在一起。每個入口點都有自己的安全驗證。

`isInsideRoot` 的邊界值測試也值得看：

```typescript
it('returns false for prefix-similar but not actually inside', () => {
  const sibling = `${ROOT}-sibling`;  // /test-root-sibling
  expect(service.isInsideRoot(sibling)).toBe(false);
});
```

`/test-root-sibling` 的字串前綴確實是 `/test-root`，但它不在 root 底下。這種邊界條件用 `path.relative()` 的方式來判斷就能正確處理，測試確保了這個行為。

## 測試按行為分群

整份測試不是按「每個 method 一個 describe」來分，而是按行為分群：

- **browseDirectories**：目錄瀏覽的完整行為，包含過濾、排序、安全檢查
- **listFiles**：三種 pattern 模式（空字串、trailing slash、fuzzy），加上快取失效的完整 describe
- **readFile**：正常讀取 + path traversal
- **mutations**：獨立的 `MROOT` 環境，CRUD 完整測試 + 路徑越界
- **isInsideRoot**：純邏輯的邊界值測試

快取失效被拉成獨立的 `describe('cache invalidation via WatchService')`，因為它是一個獨立的行為面向，有自己的 setup（需要注入 FakeWatchService）。

## 這個模式可以怎麼複用

這套策略的核心是三件事：

1. **memfs 替換 fs**：任何用到 `node:fs` 的 service 都能套用。`vi.mock` 兩行搞定，`vol.fromJSON()` 宣告式建立測試環境
2. **手寫 Fake 替換不確定性依賴**：file watcher、WebSocket、event emitter 這類非同步事件驅動的東西，都適合用 Fake + `simulate()` 的模式
3. **Constructor injection 讓替換成為可能**：不是在 service 內部 `new Chokidar()`，而是從外面注入 `WatchService` 介面。測試只是這個設計的受益者

如果你的專案裡有類似的 I/O 邊界——檔案系統、資料庫、外部 API、訊息佇列——都可以用同樣的思路：定義介面、注入依賴、測試時換成 in-memory 的 Fake。

> 這個思路在 monorepo 裡更有效。當 Fake 被抽成共用套件，前後端都能用同一份測試替身，行為一致性有保障。詳見 [Monorepo 跨層共用 Fake：一份測試替身從前端用到後端]({{< ref "/post/monorepo-shared-fake-testing" >}})。

## 參考資源

- [memfs — JavaScript file system utilities](https://github.com/streamich/memfs)
- [Vitest — Mocking](https://vitest.dev/guide/mocking)
- [Fuse.js — Lightweight fuzzy-search](https://www.fusejs.io/)
- [Martin Fowler — Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)
