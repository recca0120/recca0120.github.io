---
title: 'AI Agent 時代為什麼更需要好測試：Fake + MSW 的 agent-friendly 特性'
description: '前三篇系列文講的 Fake + MSW + 共用測試 infra，對 Claude Code 這類 AI agent 幫助特別大。整理五個具體優勢：快速回饋、訊號可信、範本可學、refactor 安全、context 省用。'
slug: agent-friendly-testing
date: '2026-04-20T08:00:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- Claude Code
- AI
draft: false
---

前三篇系列文整理了 [DI + Fake + in-memory]({{< ref "/post/di-fake-in-memory-testing" >}})、[monorepo 共用 Fake]({{< ref "/post/monorepo-shared-fake-testing" >}})、[共用 HTTP mock]({{< ref "/post/monorepo-shared-http-mock" >}})。這些測試 pattern 一直以來都是給人類看的——讀得懂、改得動、refactor 安全。

但自從開始用 Claude Code 做日常開發，發現這套 pattern 對 AI agent 的幫助比對人類更大。這篇整理五個具體原因。

## 1. 快速回饋循環：agent 改完立刻知道對不對

in-memory Fake 不碰網路、不起 Docker、不連 DB。整套測試跑完通常幾秒內。

AI agent 工作流程是這樣的：**改 code → 跑測試 → 看結果 → 決定下一步**。這個循環越快，agent 越能精確地朝正確方向走。

反例：測試要等 30 秒以上的 agent 會出現兩個病：

- **跳過測試**：agent 覺得跑一次太花時間，就「憑感覺」繼續改，累積問題到後面一次爆發
- **猜錯方向**：agent 等測試的時候，已經先改下一段 code，等紅燈出來時已經改了五件事，不知道哪件事炸了

Fake + in-memory 讓測試以毫秒為單位跑完，agent 每改一行都能立刻驗證。

## 2. 測試訊號可信：沒有 flaky test

Fake 的行為是確定性的——seed 什麼資料，get 出什麼資料。MSW 的攔截也是確定性的——handler 怎麼寫，response 就怎麼回。

這件事對 agent 特別重要。flaky test 對人類是「重跑一次就好」的小煩惱，對 agent 是災難：

- agent 看到紅燈會以為自己做錯事，開始亂改
- 改到綠燈後，agent 以為修好了，其實只是隨機通過
- 浪費大量 token 在追逐幽靈 bug

`setTimeout(r, 500)` 等 async 操作、打 real API 的網路抖動、共用 DB 狀態污染——這些都是 flaky 源頭。Fake + MSW 把這些全部消滅，紅燈就是真壞，綠燈就是真好。

## 3. 新測試有範本可抄

agent 最擅長「看現有 pattern 照抄」。

monorepo 裡如果有 `shared/testing/fakes/`，agent 要加新測試時直接：

```typescript
import { FakeUserService } from '@app/shared/testing';

test('new scenario', () => {
  const userService = new FakeUserService();
  userService.seed([...]);
  // ...
});
```

不用 invent 新 pattern、不用決定「這裡該用 mock 還是 stub」、不用翻文件學 `vi.fn().mockResolvedValue(...)` 的各種變體。

反例：每個 package 各自 mock 的專案，agent 每次進一個新檔案都要先花 context 研究「這個檔案是怎麼 mock 的」。context window 一直被測試慣例吃掉，真正有用的任務就做不多。

## 4. 行為測試讓 refactor 安全

agent 最常被派的任務之一是 refactor。如果測試綁在實作細節：

```typescript
expect(mockStorage.set).toHaveBeenCalledWith('user:1', alice);
```

refactor 一換實作（例如改用 `setItem`、加個 namespace prefix），測試立刻炸。agent 會進入「一邊改 production code 一邊改測試」的狀態——這時候測試已經沒有護衛功能了，agent 怎麼改測試都會是綠，完全失去「有沒有破壞行為」的判斷基準。

Fake + 行為斷言：

```typescript
expect(await storage.get('user:1')).toEqual(alice);
```

只要 `UserService` 對外行為沒變，refactor 怎麼改都不炸。agent 能放心重寫實作，紅燈真的就代表「行為被破壞了」，不是「實作細節動了」。

這個差異讓 agent 的 refactor 能力從「不敢動」變成「大膽動」。

## 5. Context 省下來做真正的任務

Claude Code 的 context window 是有限的。每個檔案、每個慣例、每個 mock 寫法都在消耗 tokens。

共用 test infra 的效果：agent 只要載入 `shared/testing/` 的型別定義，就能在整個 monorepo 的任何地方寫測試。不用為了寫 server 測試載 server 的 mock 慣例、為了寫 client 測試載 client 的 mock 慣例。

省下來的 context 用在真正有價值的地方：理解需求、讀業務邏輯、思考 edge case。

## agent-friendly 測試的設計原則

整理這五點反推過來，agent-friendly 的測試設計有幾個原則：

**1. 測試速度要快**
單一 test 跑超過一秒就要檢討。in-memory Fake、MSW 攔截，不要讓 agent 等網路。

**2. 依賴要能注入**
沒有 DI，agent 沒辦法抽換依賴。沒有 Fake，agent 沒辦法快速隔離。

**3. 測試要有範本**
`shared/testing/` 是最好的投資。agent 看到一個好範本，後續所有測試都長一樣。

**4. 斷言行為，不斷言實作**
`toHaveBeenCalledWith` 是 refactor 地雷。能用 `expect(state).toEqual(...)` 就不用 call count。

**5. Fake 自己要測**
agent 信任 Fake 的行為，Fake 的不變量要先寫測試驗證過。這個投資的回報是「agent 寫的所有測試都站在穩的地基上」。

## 對 Claude Code 使用者的建議

如果你正在用 Claude Code 或其他 AI agent 開發，花一天時間把專案測試重構成這個樣子，長期報酬非常高：

- agent 寫新 feature 時，測試是可信的護網
- agent 做 refactor 時，測試讓它知道有沒有弄壞東西
- agent 改 bug 時，測試確認「這個 bug 真的修好了」

反過來說，如果你的專案現在是「到處 `vi.fn()`、沒有共用 Fake、測試跑 30 秒、偶爾 flaky」的狀態，agent 的效率會打很大的折扣——它每個決策都在賭博，而不是在驗證。

## 一個小觀察：好測試對人類和 agent 的差別

以前寫好測試的動機是「減輕人類 reviewer 的負擔」。現在多了一個動機：**讓 agent 能安全地做決策**。

有趣的是，兩個需求的答案是同一套：快、穩、可預測、行為導向。寫好的測試人類受益，AI agent 受益更大。

這三篇系列文講的 pattern 不是為 AI agent 設計的，但它剛好是 agent-friendly 的——因為**好的測試本來就該長這樣**，agent 只是把「好」的標準又往上推了一階。

## 參考資源

- [DI + Fake + in-memory 測試基礎]({{< ref "/post/di-fake-in-memory-testing" >}})
- [monorepo 跨層共用 Fake]({{< ref "/post/monorepo-shared-fake-testing" >}})
- [monorepo 跨層共用 HTTP mock]({{< ref "/post/monorepo-shared-http-mock" >}})
- [Test Doubles — Martin Fowler](https://martinfowler.com/bliki/TestDouble.html)
- [Claude Code 官方文件](https://docs.claude.com/en/docs/claude-code)
