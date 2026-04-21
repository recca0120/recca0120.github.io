---
title: 'React Compiler 不自動做的 3 件事：從 512ms 降到 6ms 的實戰'
description: '我以為開了 React Compiler 就不用手動 memo，結果切 tab 卡 512ms。用 Profiler 抓出 3 個 compiler 邊界：hook 回傳的 spread、子 component 邊界、setInterval 動畫 state。'
slug: react-compiler-limits
date: '2026-04-21T22:30:00+08:00'
image: featured.png
categories:
  - Frontend
tags:
  - React
  - React Compiler
  - Performance
  - Profiler
  - TypeScript
draft: false
---

「React Compiler 都幫我自動 memo 了，不用再手動優化吧？」— 我半年前也這樣想。直到有一天客戶回報切 tab 會卡住，我打開 React DevTools Profiler 一錄，**單次 commit 512ms**，手都冷了。

專案跑的是 React 19 + React Compiler 1.0，理論上 `useMemo`、`useCallback`、`React.memo` 都不用手寫。但實際 profile 打臉：卡到的地方，compiler 全部沒救到。

這篇記錄我從 512ms 壓到 6ms 的 3 個修正，以及每個背後 compiler 為什麼管不到。

## 痛點：切 tab 512ms，切 project 580ms

背景：一個 Web-based Claude Code client。左側 project 清單，上方 session tabs，主區 MessageList 顯示對話訊息。每個 tab 內有一層深的 Provider 樹（約 15 層 Context.Provider），包含 ChannelProvider、ChannelMessagesProvider 等。

使用者動作：點不同的 session tab。React DevTools Profiler 錄到的是這樣：

```
Render: 512.6ms
What caused this update? TabProvider

TabProvider (0.2ms of 512.6ms)
├─ EditorArea (0.3ms of 512.4ms)
│  ├─ TabContent key="...tab-1" (220ms)  ← tab 1 完整 re-render
│  ├─ TabContent key="...tab-2" (150ms)  ← tab 2 完整 re-render
│  └─ TabContent key="...tab-3" (140ms)  ← tab 3 完整 re-render
```

三個 tab 同時 mount（hidden via CSS），切一次 tab 觸發**全部三個 subtree re-render**，每棵樹底下的 MessageList 跑 N 則 ChatMessage 的 Markdown + shiki 高亮。

React Compiler 這裡沒作用 — 事實擺在眼前。為什麼？

## 邊界 1：hook 回傳值 spread 每次都是新 object

第一個 log 發現的是這段：

```tsx
export function useSession(): SessionContextValue {
  const state = useContext(SessionStateContext);
  const actions = useContext(SessionActionsContext);
  if (!state || !actions) throw new Error('...');
  return { ...state, ...actions };  // ← 每次呼叫產生新 object
}
```

`state` 和 `actions` 個別來自不同 Context，各自 identity 穩定。但 `{ ...state, ...actions }` 是**新 object literal**，hook 每次被呼叫都重建。

我在 EditorArea 加一段 debug log 印 `sessionChanged`，結果每次 render 都是 `true`。即使 state 本身沒變，spread 的輸出每次都是新 reference，下游任何 `useEffect([session])` 或 `React.memo` 比對都會誤判「變了」。

**為什麼 compiler 沒救？** Compiler 做 intra-component 的 memoization，但它把 hook 當成黑盒子。`useSession()` 的輸出對呼叫端來說是動態的，compiler 無法跨過 hook 邊界推論 spread 是否該 memo。

修法：在 hook 內部手動 `useMemo`。

```tsx
export function useSession(): SessionContextValue {
  const state = useContext(SessionStateContext);
  const actions = useContext(SessionActionsContext);
  const merged = useMemo(
    () => (state && actions ? { ...state, ...actions } : null),
    [state, actions],
  );
  if (!merged) throw new Error('...');
  return merged;
}
```

這行下去，`sessionChanged` 全部變 `false`。

> [!IMPORTANT]
> Compiler 只 memo component 內部運算。跨 hook / 跨 function 的 spread、物件合併、陣列 filter 要自己 `useMemo`。

## 邊界 2：子 component 不會自動變成 `React.memo`

修完 `useSession` 後再看 profile。所有 context changed flags 都 false — 但 EditorArea 仍然每次切 tab 就 re-render 兩次（兩個 project 各兩次）。

原因：EditorArea 自己沒 context 變動，但它的 **parent re-render 了**。React 預設就是 parent render → child 被呼叫，除非 child 本身是 `React.memo`。

React Compiler 1.0 在 component 內部會 memo 各種 JSX 元素、物件字面值、callback；但它**不會自動把 child component 變成 `React.memo`**。這是 compiler 刻意的設計邊界 — 自動 memo 所有 component 會讓某些依賴 reference equality 的行為出錯，風險太高。

修法：對熱點 component 手動加 `React.memo`。

```tsx
export const EditorArea = memo(function EditorArea() {
  const { activeTabId, tabs } = useTabState();
  // ...
});
```

EditorArea 沒有 props，memo 後除非 context 真的變，否則永遠 short-circuit。

同樣的 pattern 套到 TabContent、ChatMessage 這種 leaf component。每一個都是 20 行以內的改動，但效果成倍。

## 邊界 3：高頻 setInterval + setState 動畫

這個最隱蔽。我在同一個 profile session 裡看到**366 次 commit** — 平均 4.5ms，但累積起來持續佔用 main thread。

「What caused this update?」全都指向一個 component：`SpinnerVerb`。這是處理中的「思考中」動畫，icon 在 `· ✢ * ✶ ✻ ✽` 之間循環。

原本的實作：

```tsx
const [iconIndex, setIconIndex] = useState(0);

useEffect(() => {
  const id = setInterval(() => {
    setIconIndex((i) => (i + 1) % ICON_CYCLE.length);
  }, 120);
  return () => clearInterval(id);
}, []);
```

每 120ms `setState` 一次 = 每秒 8 次 commit。每次 commit React 都要走一遍 fiber tree、檢查 memo、fire effects。**即使所有 parent 都 bail out，單純 tree walk 也有成本**。處理中期間，這個成本乘以 8 持續燒 CPU。

這不是 memoization 問題，是 **commit 頻率**問題。Compiler 無法替你決定哪些動畫該走 React state 哪些該走 DOM — 那是設計決策。

修法：icon 動畫完全跳過 React，直接寫 DOM：

```tsx
const iconRef = useRef<HTMLSpanElement | null>(null);

useEffect(() => {
  let i = 0;
  const id = setInterval(() => {
    i = (i + 1) % ICON_CYCLE.length;
    if (iconRef.current) iconRef.current.textContent = ICON_CYCLE[i];
  }, 120);
  return () => clearInterval(id);
}, []);

return <span ref={iconRef}>{ICON_CYCLE[0]}</span>;
```

ref + `textContent =` 是原生 DOM 操作，React 不知道發生了什麼，也就不會觸發 commit。Processing 期間背景 commit 頻率從 **~8 次/秒降到 ~0.2 次/秒**（只剩偶爾的 verb 換字）。

> [!TIP]
> 裝飾性動畫（scramble text、rotating icon、pulse）都適合這招。資料相關的狀態才走 React。

## 結果：512ms → 6ms

三個修法上線後重新 profile：

| 動作 | 修前 | 修後 |
|---|---|---|
| 切 tab | 512ms | 4ms |
| 切 project | 580ms | 6.6ms |
| Processing 背景 commits | 8 次/秒 | 0.2 次/秒 |

切 tab 從人感受到卡、變成幾乎無感。Enter 送出訊息的延遲也一起改善 — 那個 pipeline 跟 tab 切換共用 provider tree，背景噪音消掉後整體流暢度都上去。

## React Compiler 的真實邊界

整理一下這次學到的：

| Compiler 自動做 | 不自動做 |
|---|---|
| component 內部的 `useMemo` 等效 | 把 child component 包成 `React.memo` |
| component 內部的 `useCallback` 等效 | 跨 hook 邊界 memo hook 回傳的 spread |
| JSX 元素的 memoization | 替你決定哪些動畫該走 DOM 而不是 React state |
| 穩定 inline 物件字面值 | 分析整條 provider chain 的 re-render 成本 |

一句話：**Compiler 省掉單個 component 內部 90% 的手寫 memo，但 component 邊界跟架構層級的優化還是要自己做**。

我原本的錯誤期待是「開 compiler = 免費效能」。實際是「開 compiler = 省掉大量 boilerplate，但熱點還是要 profile 驅動手動優化」。

> [!NOTE]
> React 團隊自己也講過：compiler 不是用來取代 `React.memo`，而是取代你在 component 裡手寫的那些 `useMemo` 和 `useCallback`。高階優化策略仍需要開發者判斷。

## 做法建議

- **別猜，先 profile**。我自己這次也繞了幾個彎 — 一開始以為是 MessageList 虛擬化問題，做了半天 virtualization 才發現真正元兇是 SpinnerVerb 的 interval。Profile 花 10 分鐘，可以省 1 天亂改。
- **React DevTools Profiler 的 "What caused this update?"** 是最直接的線索。追出觸發源，往上找到根部。
- **打 console.log 印 hook 回傳 reference** 比加一堆 `useMemo` 有效 — 先確認是不是 identity 漂移的問題，再決定要不要 memo。
- **熱點手動 `React.memo`**：被高頻 parent 呼叫的 leaf component、渲染成本高的 item（Markdown / 代碼高亮）、深 provider 樹的邊界。

React Compiler 值得用 — 它省掉的樣板量很可觀，也讓日常寫 code 可以少想 memo。但開了它不代表你可以完全放手。Profile 驅動、目標明確的手動優化，跟 compiler 是搭配關係，不是替代關係。

## 參考資源

- [React Compiler 官方文件](https://react.dev/learn/react-compiler)
- [React DevTools Profiler 使用指南](https://react.dev/reference/react/Profiler)
- [React.memo API reference](https://react.dev/reference/react/memo)
- [useMemo API reference](https://react.dev/reference/react/useMemo)
