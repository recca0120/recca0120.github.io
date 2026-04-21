---
title: 'React Compiler 不自動做的 3 件事：從 512ms 降到 6ms 的實戰'
description: '我以為開了 React Compiler 就不用手動 memo，結果切 tab 卡 512ms。用 Profiler 抓出 3 個 compiler 邊界：hook 回傳的 spread、子 component 邊界、setInterval 動畫 state，附更多日常會遇到的範例。'
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

「React Compiler 都幫我自動 memo 了，不用再手動優化吧？」— 我半年前也這樣想。直到有一天同事回報切 tab 會卡住，我打開 React DevTools Profiler 一錄，**單次 commit 512ms**，手都冷了。

專案跑的是 React 19 + React Compiler 1.0，理論上 `useMemo`、`useCallback`、`React.memo` 都不用手寫。但實際 profile 打臉：卡到的地方，compiler 全部沒救到。

這篇記錄我從 512ms 壓到 6ms 的 3 個修正，以及每個背後 compiler 為什麼管不到。每個 boundary 都會多給幾個日常會遇到的範例，不只綁我的那個專案。

## 痛點：切 tab 512ms

場景是一個多分頁的工作台 app：左側是專案列表，上方是分頁（tab），主區域是可以滾動的訊息串流。每個 tab 都掛在一層深的 Provider 樹下（大約 15 層 Context.Provider，包 auth、settings、訊息、即時通知等）。訊息列表每一筆會跑 Markdown 解析加語法高亮，算偏重的 render 成本。

使用者動作：點不同的 tab。React DevTools Profiler 錄到的是這樣：

```
Render: 512.6ms
What caused this update? TabProvider

TabProvider (0.2ms of 512.6ms)
├─ WorkspacePanel (0.3ms of 512.4ms)
│  ├─ TabPanel key="...tab-1" (220ms)  ← tab 1 完整 re-render
│  ├─ TabPanel key="...tab-2" (150ms)  ← tab 2 完整 re-render
│  └─ TabPanel key="...tab-3" (140ms)  ← tab 3 完整 re-render
```

三個 tab 同時 mount（用 CSS 切 visible，不 unmount 避免重建狀態），切一次 tab 觸發**全部三個 subtree re-render**，每棵樹底下的訊息列表跑 N 筆 FeedItem 的 Markdown 高亮。

React Compiler 這裡沒作用 — 事實擺在眼前。為什麼？

## 邊界 1：hook 回傳值每次都是新 reference

第一個 log 發現的是這段：

```tsx
export function useWorkspace(): WorkspaceValue {
  const state = useContext(WorkspaceStateContext);
  const actions = useContext(WorkspaceActionsContext);
  if (!state || !actions) throw new Error('...');
  return { ...state, ...actions };  // ← 每次呼叫產生新 object
}
```

`state` 和 `actions` 個別來自不同 Context，各自 identity 穩定。但 `{ ...state, ...actions }` 是**新 object literal**，hook 每次被呼叫都重建。

我在 WorkspacePanel 加一段 debug log 印 `workspaceChanged`，結果每次 render 都是 `true`。即使 state 本身沒變，spread 的輸出每次都是新 reference，下游任何 `useEffect([workspace])` 或 `React.memo` 比對都會誤判「變了」。

**為什麼 compiler 沒救？** Compiler 做 intra-component 的 memoization，但它把 hook 當成黑盒子。`useWorkspace()` 的輸出對呼叫端來說是動態的，compiler 無法跨過 hook 邊界推論 spread 是否該 memo。

修法：在 hook 內部手動 `useMemo`。

```tsx
export function useWorkspace(): WorkspaceValue {
  const state = useContext(WorkspaceStateContext);
  const actions = useContext(WorkspaceActionsContext);
  const merged = useMemo(
    () => (state && actions ? { ...state, ...actions } : null),
    [state, actions],
  );
  if (!merged) throw new Error('...');
  return merged;
}
```

這行下去，`workspaceChanged` 全部變 `false`。

### 其他常見的「hook 回傳新 reference」陷阱

除了 spread，下面這些 pattern 都會中招：

**陣列 filter / map：**

```tsx
// ❌ 每次呼叫都是新陣列
export function useVisibleItems() {
  const { items, filter } = useContext(ListContext);
  return items.filter((item) => item.status === filter);
}

// ✅ memo 起來
export function useVisibleItems() {
  const { items, filter } = useContext(ListContext);
  return useMemo(
    () => items.filter((item) => item.status === filter),
    [items, filter],
  );
}
```

**條件式物件：**

```tsx
// ❌ options 每次都是新物件
export function useQueryOptions(id: string) {
  return {
    queryKey: ['item', id],
    enabled: Boolean(id),
    staleTime: 30_000,
  };
}
```

`queryKey` 本身就是新陣列，整個 options 也是新物件。丟到 React Query / SWR 這種靠 reference 做 cache key 比較的 library 時，就算外層 compiler 幫你 memo，hook 內部自己吐新物件還是會把下游搞壞。

**合併預設值：**

```tsx
// ❌ 沒改 config 也會回傳新物件
export function useConfig(overrides?: Partial<Config>) {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ✅
export function useConfig(overrides?: Partial<Config>) {
  return useMemo(
    () => ({ ...DEFAULT_CONFIG, ...overrides }),
    [overrides],
  );
}
```

> [!IMPORTANT]
> Compiler 只 memo component 內部運算。跨 hook / 跨 function 的 spread、物件合併、陣列 filter 都要自己 `useMemo`。

## 邊界 2：子 component 不會自動變成 `React.memo`

修完 `useWorkspace` 後再看 profile。所有 context changed flags 都 false — 但 WorkspacePanel 仍然每次切 tab 就 re-render 兩次。

原因：WorkspacePanel 自己沒 context 變動，但它的 **parent re-render 了**。React 預設就是 parent render → child 被呼叫，除非 child 本身是 `React.memo`。

React Compiler 1.0 在 component 內部會 memo 各種 JSX 元素、物件字面值、callback；但它**不會自動把 child component 變成 `React.memo`**。這是 compiler 刻意的設計邊界 — 自動 memo 所有 component 會讓某些依賴 reference equality 或刻意 force re-render 的行為出錯，風險太高。

> [!NOTE]
> React 官方文件會提到 compiler「相當於幫你 memo 整棵 tree」— 那指的是 component 內部的 JSX 和 value。跨 component 邊界的 bail-out 還是得靠 `React.memo` 的 props 淺比較。

修法：對熱點 component 手動加 `React.memo`。

```tsx
export const WorkspacePanel = memo(function WorkspacePanel() {
  const { activeTabId, tabs } = useTabState();
  // ...
});
```

WorkspacePanel 沒有 props，memo 後除非 context 真的變，否則永遠 short-circuit。

### 什麼時候值得手動 `React.memo`

不是所有 component 都該 memo，太濫用反而增加淺比較的成本。實務上挑這三種：

**1. 渲染成本高的 leaf component**

```tsx
const FeedItem = memo(function FeedItem({ post }: { post: Post }) {
  const html = useMarkdownToReact(post.body);      // 解 Markdown 成 React 節點
  const highlighted = useSyntaxHighlight(html);    // shiki / prism 高亮
  return <article>{highlighted}</article>;
});
```

列表裡 100 筆，parent 一動整排 re-render，即使內容沒變也要重跑 Markdown。memo 後只有該筆 post 變了才 re-render。

**2. 吃 props 但 props 多半穩定的 container**

```tsx
const SettingsPanel = memo(function SettingsPanel({ userId }: { userId: string }) {
  // 只有 userId 變才重新抓設定
});
```

**3. 深 provider tree 的邊界**

當你知道某個 component 下面掛了一大串 Provider 或昂貴的 subtree，而它的 props / context 不常變，memo 它等於替整片 subtree 開一個 short-circuit 閘門。

反過來，props 永遠在變的 component（例如接收 `onClick`、`style`、`children`）memo 了也沒用，淺比較每次都 fail。這種情況要先處理 props 的 identity 穩定性。

## 邊界 3：高頻 setInterval + setState 動畫

這個最隱蔽。我在同一個 profile session 裡看到**366 次 commit** — 平均 4.5ms，但累積起來持續佔用 main thread。

「What caused this update?」全都指向一個 component：`LoadingSpinner`。這是一個 loading 時的動畫 icon，在 `· ✢ * ✶ ✻ ✽` 之間循環。

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

每 120ms `setState` 一次 = 每秒 8 次 commit。每次 commit React 都要走一遍 fiber tree、檢查 memo、fire effects。**即使所有 parent 都 bail out，單純 tree walk 也有成本**。loading 期間，這個成本乘以 8 持續燒 CPU。

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

ref + `textContent =` 是原生 DOM 操作，React 不知道發生了什麼，也就不會觸發 commit。Loading 期間背景 commit 頻率從 **~8 次/秒降到 ~0.2 次/秒**。

### 其他「高頻 state 把 commit 打爆」的情境

同樣的思路套到這些地方通常都有效：

**滑鼠座標跟隨：**

```tsx
// ❌ mousemove 每秒觸發 60+ 次
const [pos, setPos] = useState({ x: 0, y: 0 });
useEffect(() => {
  const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
  window.addEventListener('mousemove', onMove);
  return () => window.removeEventListener('mousemove', onMove);
}, []);
return <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} />;

// ✅ 直接改 style，不經過 React
const ref = useRef<HTMLDivElement>(null);
useEffect(() => {
  const onMove = (e: MouseEvent) => {
    if (ref.current) {
      ref.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }
  };
  window.addEventListener('mousemove', onMove);
  return () => window.removeEventListener('mousemove', onMove);
}, []);
return <div ref={ref} />;
```

**滾動進度條：**

```tsx
// ❌ 每次 scroll 都 setState
const [progress, setProgress] = useState(0);
useEffect(() => {
  const onScroll = () => setProgress(window.scrollY / document.body.scrollHeight);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}, []);
```

scroll 一秒可以觸發上百次，走 React state 等於把整個 subtree 每秒 commit 100 次。同樣改成 ref + 直接改 `style.width` 或 CSS custom property。

**倒數計時器（只用來顯示）：**

```tsx
// ❌ 每秒 setState 強制 commit 整棵樹
const [remaining, setRemaining] = useState(60);
useEffect(() => {
  const id = setInterval(() => setRemaining((r) => r - 1), 1000);
  return () => clearInterval(id);
}, []);
```

如果倒數只是單純顯示給使用者看、其他 component 不需要知道當前秒數，用 ref + `textContent` 更便宜。真的有邏輯要依賴時間（例如時間到要自動 submit），再走 state。

> [!TIP]
> 判斷標準：這個值有沒有影響 **React 的 render 邏輯**？如果只是視覺呈現、沒有任何 component 分支要根據它決定畫什麼，那就適合繞過 React 直接操作 DOM。

## 結果：512ms → 6ms

三個修法上線後重新 profile：

| 動作 | 修前 | 修後 |
|---|---|---|
| 切 tab | 512ms | 4ms |
| 切專案 | 580ms | 6.6ms |
| Loading 背景 commits | 8 次/秒 | 0.2 次/秒 |

切 tab 從人感受到卡、變成幾乎無感。其他互動（送出表單、開啟面板）的延遲也一起改善 — 那些 pipeline 跟 tab 切換共用 provider tree，背景噪音消掉後整體流暢度都上去。

## 其他 compiler 也救不了的盲區

不只上面三個，社群與官方文件陸續整理出這些情境 compiler 一樣無能為力，遇到就要自己處理：

- **Render 階段 mutate props 或物件**：compiler 偵測到 mutation 會直接放棄優化那段 code，因為安全性無法保證。
- **Render 階段讀 ref**：`ref.current` 的值 compiler 不會追蹤，不能當 memo 依賴。
- **跨 component 共享昂貴計算**：compiler 的 memo 是 per-component 的。如果三個不同 component 都用同一組 input 跑同一個昂貴計算，compiler 只會各自 memo 各自跑一次。真的要共用要用 `useMemo` 加上外部 cache，或把計算推到更高層。
- **外部 store（非 React 狀態）訂閱**：`useSyncExternalStore` 的 selector 回傳值 compiler 不會幫你 memo，要自己確保 selector 穩定或用 `useMemo`。
- **列表虛擬化**：compiler 不會因為你有 10000 筆就自動幫你做 virtualization。那是架構決策。

## React Compiler 的真實邊界

整理一下這次學到的：

| Compiler 自動做 | 不自動做 |
|---|---|
| component 內部的 `useMemo` 等效 | 把 child component 包成 `React.memo` |
| component 內部的 `useCallback` 等效 | 跨 hook 邊界 memo hook 回傳的 spread / filter / 合併 |
| JSX 元素的 memoization | 替你決定哪些動畫該走 DOM 而不是 React state |
| 穩定 inline 物件字面值 | 分析整條 provider chain 的 re-render 成本 |
| 單一 component 的重算跳過 | 跨 component 共享昂貴計算的快取 |

一句話：**Compiler 省掉單個 component 內部 90% 的手寫 memo，但 component 邊界跟架構層級的優化還是要自己做**。

我原本的錯誤期待是「開 compiler = 免費效能」。實際是「開 compiler = 省掉大量 boilerplate，但熱點還是要 profile 驅動手動優化」。

## 做法建議

- **別猜，先 profile**。我自己這次也繞了幾個彎 — 一開始以為是 list 虛擬化問題，做了半天 virtualization 才發現真正元兇是 LoadingSpinner 的 interval。Profile 花 10 分鐘，可以省 1 天亂改。
- **React DevTools Profiler 的 "What caused this update?"** 是最直接的線索。追出觸發源，往上找到根部。
- **打 console.log 印 hook 回傳 reference** 比加一堆 `useMemo` 有效 — 先確認是不是 identity 漂移的問題，再決定要不要 memo。
- **熱點手動 `React.memo`**：被高頻 parent 呼叫的 leaf component、渲染成本高的 item（Markdown / 代碼高亮）、深 provider 樹的邊界。
- **高頻動畫走 ref 改 DOM**：mousemove、scroll、interval icon、倒數顯示這類只影響視覺的狀態，不要走 React state。

React Compiler 值得用 — 它省掉的樣板量很可觀，也讓日常寫 code 可以少想 memo。但開了它不代表你可以完全放手。Profile 驅動、目標明確的手動優化，跟 compiler 是搭配關係，不是替代關係。

## 參考資源

- [React Compiler 官方文件](https://react.dev/learn/react-compiler)
- [React Compiler v1.0 發布文](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React DevTools Profiler 使用指南](https://react.dev/reference/react/Profiler)
- [React.memo API reference](https://react.dev/reference/react/memo)
- [useMemo API reference](https://react.dev/reference/react/useMemo)
