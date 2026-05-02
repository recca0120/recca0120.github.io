---
title: 'vitest-fail-on-console：讓 console.error 不再默默被忽略'
description: '介紹 vitest-fail-on-console 套件，說明為什麼 console.warn/error 出現在測試裡是壞味道，以及怎麼用這個套件強制讓測試失敗、保持輸出乾淨。'
slug: vitest-fail-on-console
date: '2026-05-02T08:18:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- Vitest
- Node.js
draft: false
---

測試全綠，但 terminal 裡滿是紅色的 `console.error`。這種情況很常見，也很容易被忽略——畢竟測試過了嘛。但這些 error 不是憑空冒出來的，它們代表某個地方出了問題，只是沒人在乎。

[vitest-fail-on-console](https://github.com/thomasbrodusch/vitest-fail-on-console) 做的事很簡單：只要測試裡出現 `console.error` 或 `console.warn`，就讓那個測試失敗。強迫你正視這些訊息，而不是讓它們淹沒在輸出裡。

## 為什麼 console.error 出現在測試裡是壞味道

Vitest 預設不管 console 輸出。你可以在測試裡瘋狂 `console.error`，測試照樣過。

問題是：`console.error` 通常不是無意義的。它可能是：

- React 的 prop type 警告
- 某個 async 操作的錯誤被 catch 住但沒有妥善處理
- 第三方套件在告訴你用法錯了
- 自己程式裡某個 error handler 被觸發了

這些訊息出現在測試裡，代表測試在一個「有點不對勁」的狀態下執行，只是剛好沒有 throw 出來。隨著時間累積，測試輸出變成一片噪音，真正重要的訊息被淹沒，沒人再看了。

`vitest-fail-on-console` 把這個問題翻面：讓 console 訊息變成測試失敗，你才會被迫去處理它。

## 安裝

```bash
npm install -D vitest-fail-on-console
```

## 設定

在 setup 檔案裡引入並呼叫：

```typescript
// tests/setup.ts
import failOnConsole from 'vitest-fail-on-console'

failOnConsole()
```

然後在 `vitest.config.ts` 裡把這個 setup 檔掛上去：

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
  },
})
```

就這樣。之後只要有測試裡出現 `console.error` 或 `console.warn`，那個測試就會失敗。

## 選項說明

`failOnConsole()` 接受一個選項物件，可以調整哪些 console 方法會觸發失敗：

```typescript
failOnConsole({
  shouldFailOnError: true,   // 預設 true
  shouldFailOnWarn: true,    // 預設 true
  shouldFailOnLog: false,    // 預設 false
  shouldFailOnInfo: false,   // 預設 false
  shouldFailOnDebug: false,  // 預設 false
  shouldFailOnAssert: false, // 預設 false
})
```

通常只需要管 `error` 和 `warn`，`log` / `info` / `debug` 視專案習慣決定要不要也納進來。

### allowMessage

允許特定訊息通過，不觸發失敗。適合那種「已知會出現、暫時無法修」的訊息：

```typescript
failOnConsole({
  allowMessage: (message) => {
    // 這個警告是第三方套件的已知問題，暫時白名單
    return /ResizeObserver loop limit exceeded/.test(message)
  },
})
```

### silenceMessage

跟 `allowMessage` 類似，但連 console 輸出也一起隱藏，輸出更乾淨：

```typescript
failOnConsole({
  silenceMessage: (message) => {
    return /Not implemented: navigation/.test(message)
  },
})
```

### skipTest

跳過特定測試檔或測試名稱，整個測試不套用 fail-on-console：

```typescript
failOnConsole({
  skipTest: ({ testPath, testName }) => {
    // legacy 目錄下的測試暫時跳過
    return testPath.includes('/legacy/')
  },
})
```

### afterEachDelay

有時候 async 操作的 console 呼叫會在測試結束後才執行，這個選項讓套件等一段時間再檢查：

```typescript
failOnConsole({
  afterEachDelay: 100, // 等 100ms，預設是 0
})
```

## 預期的 console.error 怎麼處理

裝了 `vitest-fail-on-console` 之後，如果某個測試就是要驗證「出現 error 時會呼叫 console.error」，直接讓它出現會讓測試失敗。

正確做法是用 `vi.spyOn` 把 `console.error` mock 掉，測試結束後就不會觸發 fail-on-console：

```typescript
it('logs an error when request fails', () => {
  // mock 掉，讓訊息不真的輸出到 console
  vi.spyOn(console, 'error').mockImplementation(() => {})

  triggerSomethingThatLogsError()

  // 驗證確實有被呼叫
  expect(console.error).toHaveBeenCalledWith('Request failed')
})
```

這個寫法同時達到兩件事：測試明確說「我知道這裡會有 error」，而且斷言了 error 的內容。比讓 `console.error` 默默出現要嚴謹得多。

## 搭配乾淨測試環境一起用

`vitest-fail-on-console` 只處理 console 輸出的問題。如果你的測試還有 I/O 邊界需要替換（檔案系統、file watcher），可以搭配 memfs 一起用——思路是一樣的：讓測試環境的每個面向都在你的掌控之內。

相關做法可以參考 [用 memfs + FakeWatchService 測試檔案系統]({{< ref "/post/memfs-fake-watch-testing" >}})。

## 參考資源

- [vitest-fail-on-console — GitHub](https://github.com/thomasbrodusch/vitest-fail-on-console)
- [vitest-fail-on-console — npm](https://www.npmjs.com/package/vitest-fail-on-console)
- [Vitest — setupFiles 設定](https://vitest.dev/config/#setupfiles)
