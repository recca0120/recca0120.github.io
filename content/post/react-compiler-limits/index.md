---
title: 'React Compiler 不自動做的 3 件事：從 512ms 降到 6ms 的實戰'
description: '我以為開了 React Compiler 就不用手動 memo，結果切 tab 卡 512ms。用 Profiler 抓出 3 個 compiler 邊界：子 component 邊界、prop capture 的 identity 意圖、setInterval 動畫 state，附更多日常會遇到的範例。'
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

> Compiler 其實做得比你以為的多。寫這篇時我用 `babel-plugin-react-compiler` 實際編譯程式碼做驗證，才發現很多「加 `useMemo` 看起來有用」的情境其實 compiler 本來就幫你處理了 — 例如 hook 裡回傳 `{ ...state, ...actions }` 的 spread、`.filter()` 的結果、`{...DEFAULT, ...overrides}` 的合併，compiler 都會自動 memo。**真正需要你出手的是下面這 3 個邊界**，其他的別亂加 `useMemo`。

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

## 邊界 1：Compiler 無法表達「這個 prop 不要納入 identity」

第一個抓到的是 TabProvider 的 actions 每次 render 都換身份。

原本的寫法：

```tsx
export function TabProvider({ projectId, children }: { projectId?: string; children: ReactNode }) {
  const [state, setState] = useState<TabState>({ tabs: {}, activeTabId: null });

  const addTab = (id: string) => {
    setState((prev) => ({ ...prev, tabs: { ...prev.tabs, [id]: DEFAULT_META } }));
  };

  const createNewTab = () => {
    const tabId = crypto.randomUUID();
    setState((prev) => ({
      tabs: { ...prev.tabs, [tabId]: { ...DEFAULT_META, projectId } }, // ← 用到 prop
      activeTabId: tabId,
    }));
    return { tabId };
  };

  // ... 另外 6 個 action

  const actions = { addTab, createNewTab /* ... */ };

  return <TabActionsContext.Provider value={actions}>{children}</TabActionsContext.Provider>;
}
```

Compiler 會幫忙 memo，但它看到 `createNewTab` 的 closure 用到 `projectId`，會**保守地把 `projectId` 納入 actions 的 dep**。切 project 時 `projectId` 變 → actions 換新 identity → `<TabContent actions={actions}>` 即使有 `React.memo` 也會整片 re-render。

問題在意圖：**`projectId` 的值只有在 `createNewTab` 被「呼叫」的那一刻才重要**，不是定義時。`addTab` 根本沒用到 `projectId`，但因為它跟 `createNewTab` 一起組成 actions object，也被拖下水。

這是 compiler 的 blind spot：**「我希望 `projectId` 只在 call time 讀，不要納入 identity」是意圖層面的資訊，code 本身寫不出來**，compiler 只能保守推論。

修法：用 `useState` initializer 一次鎖定 actions，prop 改走 ref 在 call time 讀最新值。

```tsx
export function TabProvider({ projectId, children }: { projectId?: string; children: ReactNode }) {
  const [state, setState] = useState<TabState>({ tabs: {}, activeTabId: null });

  const projectIdRef = useRef(projectId);
  useLayoutEffect(() => {
    projectIdRef.current = projectId; // 在 commit 前同步
  });

  const [actions] = useState(() => ({
    addTab: (id: string) => {
      setState((prev) => ({ ...prev, tabs: { ...prev.tabs, [id]: DEFAULT_META } }));
    },
    createNewTab: () => {
      const tabId = crypto.randomUUID();
      setState((prev) => ({
        tabs: { ...prev.tabs, [tabId]: { ...DEFAULT_META, projectId: projectIdRef.current } },
        activeTabId: tabId,
      }));
      return { tabId };
    },
    // ... 另外 6 個 action
  }));

  return <TabActionsContext.Provider value={actions}>{children}</TabActionsContext.Provider>;
}
```

`useState(() => ({...}))` 的 initializer 只跑一次，actions 從頭到尾同一個 reference。`useLayoutEffect` 在每次 commit 前同步 `projectIdRef.current`，action 被呼叫時讀到的永遠是最新值。

> 也可以直接把 `projectIdRef.current = projectId` 寫在 render body 裡（React 官方允許的 escape hatch），但 concurrent rendering 下 render 可能被重複執行、丟棄，用 `useLayoutEffect` 更穩。

下游的 `memo(TabContent)` 終於能發揮作用 — 切 project 時 `TabProvider` 本體 render，但 actions 不變 → TabContent props 不變 → memo short-circuit → 整片 subtree 不重 render。

### 什麼時候需要這個 pattern

不是所有 prop 都要這樣繞。用 ref 捕捉的適用情境：

- **Action function 內部要讀 prop 的當前值**，但不希望 action identity 隨 prop 變動
- **prop 變動頻率 ≫ 呼叫頻率**（像 `projectId` 每次切 project 就變，但 `createNewTab` 一個 session 才呼叫一次）
- **downstream 用 identity 做 short-circuit**（`React.memo` 的 props 比較、`useEffect` deps）

反過來，如果 action identity 本來就沒人在比較，或 prop 本身很穩定，就不需要這個 pattern。濫用 ref 會讓 prop 和 action 的時序關係更難追。

> Compiler 的 dep 推論是保守的 — 看到 closure 使用變數就納入 dep。想「讓某個變數不進 dep」只能靠 ref 這類 runtime indirection，因為這是 code 層面表達不出的意圖。

## 邊界 2：子 component 不會自動變成 `React.memo`

修完 TabProvider 的 actions identity 後再看 profile。TabProvider 本體 render 時 actions 穩住了 — 但 WorkspacePanel 仍然每次切 tab 就 re-render 兩次。

原因：WorkspacePanel 自己沒 context 變動，但它的 **parent re-render 了**。React 預設就是 parent render → child 被呼叫，除非 child 本身是 `React.memo`。

React Compiler 1.0 在 component 內部會 memo 各種 JSX 元素、物件字面值、callback；但它**不會自動把 child component 變成 `React.memo`**。這是 compiler 刻意的設計邊界 — 自動 memo 所有 component 會讓某些依賴 reference equality 或刻意 force re-render 的行為出錯，風險太高。

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
  const html = useMarkdownToReact(post.body); // 解 Markdown 成 React 節點
  const highlighted = useSyntaxHighlight(html); // shiki / prism 高亮
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

反過來，props 永遠在變的 component（例如接收 `onClick`、`style`、`children`）memo 了也沒用，淺比較每次都 fail。這種情況要先處理 props 的 identity 穩定性（見邊界 1）。

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

return <span>{ICON_CYCLE[iconIndex]}</span>;
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

> 判斷標準：這個值有沒有影響 **React 的 render 邏輯**？如果只是視覺呈現、沒有任何 component 分支要根據它決定畫什麼，那就適合繞過 React 直接操作 DOM。

## 結果：512ms → 6ms

三個修法上線後重新 profile：

| 動作 | 修前 | 修後 |
|---|---|---|
| 切 tab | 512ms | 4ms |
| 切專案 | 580ms | 6.6ms |
| Loading 背景 commits | 8 次/秒 | 0.2 次/秒 |

切 tab 從人感受到卡、變成幾乎無感。其他互動（送出表單、開啟面板）的延遲也一起改善 — 那些 pipeline 跟 tab 切換共用 provider tree，背景噪音消掉後整體流暢度都上去。

## Compiler 其實幫你做了哪些（別重複加 useMemo）

寫這篇時我做了一件事：用 `babel-plugin-react-compiler` 直接編譯各種寫法看輸出，驗證「哪些 pattern 真的需要手動 memo」。結果是很多你以為要手動 memo 的其實 compiler 本來就做了。

### Hook 裡面的 spread / filter / 合併 — 不用加

```tsx
export function useSession() {
  const state = useContext(StateCtx);
  const actions = useContext(ActionsCtx);
  if (!state || !actions) throw new Error('...');
  return { ...state, ...actions }; // Compiler 會 memo on [state, actions]
}
```

Compiler 編譯後的實際輸出長這樣：

```js
// 編譯後
let t0;
if ($[0] !== actions || $[1] !== state) {
  t0 = { ...state, ...actions };
  $[0] = actions;
  $[1] = state;
  $[2] = t0;
} else {
  t0 = $[2]; // 重用 cache
}
return t0;
```

同樣的事 `items.filter(...)`、`{ ...DEFAULT, ...overrides }` 也都會自動 memo。我原本在專案裡幫 `useSession` 加的 `useMemo` 是純冗餘 — 看編譯後程式碼確認 compiler 已經做同樣的事。

### Provider value 的 inline object — 不用加

```tsx
// 以下兩種寫法編譯後完全一樣
return <Ctx.Provider value={{ socket }}>{children}</Ctx.Provider>;

// 跟
const value = useMemo(() => ({ socket }), [socket]);
return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
```

我實測過兩種 source 分別編譯，出來的 `_c(N)` cache slot 配置（`N` 是 compiler 根據該 component 有多少個值要 memo 決定的總數）、`if ($[0] !== socket)` 的 dep 檢查完全相同。自己加 `useMemo` 只是 compile 前看起來有差，compile 後零差異。

### 結論

遇到你覺得「要不要加 useMemo」的時候，順序：

1. 先 profile 看有沒有 render 問題
2. 如果有，確認是上面 3 個邊界哪一個（prop identity 被納入、沒 memo boundary、高頻 commit）
3. **如果不是那 3 個**，通常 compiler 已經處理 — 別亂加

### 怎麼驗證：30 秒 probe

不靠記憶、不靠文件，直接編譯看輸出。有兩種做法：

**方法 1：網頁零安裝**

開 [React Compiler Playground](https://playground.react.dev/)，左邊貼 source、右邊直接出編譯結果。適合快速驗證單一 snippet。

**方法 2：本地 CLI 跑自己的檔案**

```bash
# 安裝 babel CLI 和 TS preset（babel-plugin-react-compiler 本來就有了）
pnpm add -D @babel/cli @babel/core @babel/preset-typescript

# 編譯單一檔案印出結果
npx babel \
  --presets @babel/preset-typescript \
  --plugins babel-plugin-react-compiler \
  --no-babelrc \
  src/components/YourProvider.tsx | less
```

若常常要看，加進 `package.json` 的 scripts：

```json
{
  "scripts": {
    "probe": "babel --presets @babel/preset-typescript --plugins babel-plugin-react-compiler --no-babelrc"
  }
}
```

然後 `pnpm probe src/components/YourProvider.tsx | less`。

看輸出：

- 開頭有 `import { c as _c } from "react/compiler-runtime"` + `const $ = _c(N)` → Compiler 編譯成功
- 看到 `if ($[0] !== dep) { t0 = ...; } else { t0 = $[2]; }` → 這段有 memo，**不要自己加 useMemo**
- 完全沒看到 cache check → Compiler 決定 bail out（可能偵測到 mutation、ref 讀取、或非 component/hook）

我自己就是這樣發現：某個 provider 的 `<AppStateContext.Provider value={{ user, theme, prefs, socket }}>` 在編譯輸出裡長這樣：

```js
// 索引 $[16]..$[20] 依該 component 的 cache slot 配置而定，不是固定值
if ($[16] !== prefs || $[17] !== socket || $[18] !== theme || $[19] !== user) {
  t13 = { user, theme, prefs, socket };
  $[16] = prefs; $[17] = socket; $[18] = theme; $[19] = user;
  $[20] = t13;
} else {
  t13 = $[20];
}
```

四個欄位各自當 dep，任一沒變就重用 cached value。這比我自己寫 `useMemo(() => ({...}), [prefs, socket, theme, user])` 更不會漏 dep — compiler 分析比人類可靠。

## 其他 compiler 也救不了的盲區

不只上面三個，社群與官方文件陸續整理出這些情境 compiler 一樣無能為力，遇到就要自己處理：

- **Render 階段 mutate props 或物件**：compiler 偵測到 mutation 會直接放棄優化那段 code，因為安全性無法保證。
- **Render 階段讀 ref**：`ref.current` 的值 compiler 不會追蹤，不能當 memo 依賴。
- **跨 component 共享昂貴計算**：compiler 的 memo 是 per-component 的。如果三個不同 component 都用同一組 input 跑同一個昂貴計算，compiler 只會各自 memo 各自跑一次。真的要共用要用 `useMemo` 加上外部 cache，或把計算推到更高層。
- **列表虛擬化**：compiler 不會因為你有 10000 筆就自動幫你做 virtualization。那是架構決策。

## React Compiler 的真實邊界

整理一下這次學到的：

| Compiler 自動做 | 不自動做 |
|---|---|
| component 內部的 `useMemo` 等效 | 把 child component 包成 `React.memo` |
| component 內部的 `useCallback` 等效 | 表達「某個 prop 不要納入 identity」的意圖 |
| JSX 元素的 memoization | 替你決定哪些動畫該走 DOM 而不是 React state |
| 穩定 inline 物件字面值 / spread / 合併 | 分析整條 provider chain 的 re-render 成本 |
| hook 回傳值的 memo | 跨 component 共享昂貴計算的快取 |

一句話：**Compiler 省掉單個 component 內部 90% 的手寫 memo，但 component 邊界跟架構層級的優化還是要自己做**。

我原本的錯誤期待是「開 compiler = 免費效能」。實際是「開 compiler = 省掉大量 boilerplate，但熱點還是要 profile 驅動手動優化」。

## 做法建議

- **別猜，先 profile**。我自己這次也繞了幾個彎 — 一開始以為是 list 虛擬化問題，做了半天 virtualization 才發現真正元兇是 LoadingSpinner 的 interval。Profile 花 10 分鐘，可以省 1 天亂改。
- **React DevTools Profiler 的 "What caused this update?"** 是最直接的線索。追出觸發源，往上找到根部。
- **不確定某個 pattern 要不要加 `useMemo` 時，直接編譯看**。裝 `babel-plugin-react-compiler`，30 行的 node script 跑 babel transform 就能看出 compiler 有沒有做。這比想像 / 猜測可靠得多。
- **熱點手動 `React.memo`**：被高頻 parent 呼叫的 leaf component、渲染成本高的 item（Markdown / 代碼高亮）、深 provider 樹的邊界。
- **高頻動畫走 ref 改 DOM**：mousemove、scroll、interval icon、倒數顯示這類只影響視覺的狀態，不要走 React state。

React Compiler 值得用 — 它省掉的樣板量很可觀，也讓日常寫 code 可以少想 memo。但開了它不代表你可以完全放手。Profile 驅動、目標明確的手動優化，跟 compiler 是搭配關係，不是替代關係。

## 參考資源

- [React Compiler 官方文件](https://react.dev/learn/react-compiler)
- [React Compiler v1.0 發布文](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React DevTools Profiler 使用指南](https://react.dev/reference/react/Profiler)
- [React.memo API reference](https://react.dev/reference/react/memo)
- [useMemo API reference](https://react.dev/reference/react/useMemo)
