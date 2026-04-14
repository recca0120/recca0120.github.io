---
title: 'React Compiler 1.0 + Vite 8：@vitejs/plugin-react v6 拆掉 Babel 之後，正確的安裝方式'
description: 'React Compiler 2025 年 10 月 1.0 stable，但 @vitejs/plugin-react v6 同時把內建 Babel 換成 oxc，舊的 react({ babel: {...} }) 寫法在 Vite 8 已經不能用。整理 2026 年正確的安裝流程、ESLint 設定、漸進導入策略。'
slug: react-compiler-vite-v6
date: '2026-04-14T23:30:00+08:00'
image: featured.jpg
categories:
- Frontend
tags:
- react
- react-compiler
- vite
- performance
draft: false
---

React Compiler 2025 年 10 月釋出 **1.0 stable**,自動幫你做 `useMemo` / `useCallback` / `React.memo` 的工作。網路上大部分教學還在教舊的 `react({ babel: { plugins: [...] } })` 寫法——在 Vite 8 + `@vitejs/plugin-react` v6 已經不能用了。

v6 做了一個大動作:**拆掉內建 Babel,改用 oxc**。JSX 轉譯、Fast Refresh 全部走 Rust 實作,速度快很多,但代價是 Babel plugin 不能再塞進 `react({ babel: {...} })`。要跑 React Compiler 這類 Babel plugin,現在要外掛 `@rolldown/plugin-babel`。

這篇整理 2026 年正確的安裝方式,以及 React Compiler 本身該怎麼用。

## React Compiler 到底在做什麼

手寫 React 最煩的一件事是**到處塞 memo**。子組件每次 re-render、函式 reference 每次變、props 淺比較失敗——解法是 `useMemo` / `useCallback` / `React.memo` 三兄弟,但什麼時候該加、什麼時候加了沒用,靠肉眼很難判斷。

React Compiler 在 build time 分析你的 component,**自動在對的位置插記憶化程式碼**。

原始碼:

```jsx
function TodoList({ items, filter }) {
  const visible = items.filter(i => i.tag === filter);
  const onClick = (id) => toggle(id);
  return <List items={visible} onClick={onClick} />;
}
```

編譯後大致長這樣:

```jsx
function TodoList({ items, filter }) {
  const $ = _c(4);
  let visible;
  if ($[0] !== items || $[1] !== filter) {
    visible = items.filter(i => i.tag === filter);
    $[0] = items; $[1] = filter; $[2] = visible;
  } else {
    visible = $[2];
  }
  // onClick 跟整段 JSX 也照樣 cache
  // ...
}
```

`_c()` 是 `react/compiler-runtime` 提供的 slot 快取。粒度做到**每個表達式**,不是整個 component 包一層 memo——比你手寫 useMemo 精細很多。

## 2026/4 的狀態

- **1.0 stable**:2025/10/7 正式 GA
- **實戰驗證**:Meta 自家 Instagram、Quest Store 跑超過一年
- **React 版本要求**:React 19 原生支援;React 17 / 18 要裝 `react-compiler-runtime`
- **只吃 function component**:class component 跳過

## Vite 8 + @vitejs/plugin-react v6(新寫法)

v6 拿掉 Babel,所以跑 Babel plugin 要另外裝 `@rolldown/plugin-babel`:

```bash
npm i -D @vitejs/plugin-react @rolldown/plugin-babel babel-plugin-react-compiler
```

```js
// vite.config.js
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { babel } from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    babel({
      include: /\.[jt]sx?$/,
      babelConfig: reactCompilerPreset(),
    }),
    react(),
  ],
})
```

兩個關鍵:

1. **`reactCompilerPreset()` 從 `@vitejs/plugin-react` 匯出**——它幫你把 `babel-plugin-react-compiler` 配好,不用自己寫 preset
2. **順序**:`babel()` 要在 `react()` 之前,compiler 必須在其他 transform 前跑

要搭其他 Babel plugin:

```js
babel({
  include: /\.[jt]sx?$/,
  babelConfig: {
    ...reactCompilerPreset(),
    plugins: ['@babel/plugin-proposal-throw-expressions'],
  },
})
```

## Vite 7 以下 / @vitejs/plugin-react v5(舊寫法)

如果你還沒升 Vite 8,舊寫法繼續用:

```bash
npm i -D @vitejs/plugin-react babel-plugin-react-compiler
```

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
})
```

兩種寫法差一個大版號就不能共用,踩雷的人多半是抄了舊文章到 Vite 8 的專案。

## Next.js 15.3.1+

Next 直接內建,不用自己接 Babel:

```js
// next.config.js
module.exports = {
  experimental: {
    reactCompiler: true,
  },
}
```

裝 plugin:`npm i babel-plugin-react-compiler`。要客製模式:

```js
experimental: {
  reactCompiler: {
    compilationMode: 'annotation',
  },
}
```

**注意**:Next 已經自動啟用 compiler 的話,**別再手動加 Babel plugin**,會重複編譯。

## Webpack / Rspack

```js
// webpack.config.js
{
  test: /\.[jt]sx?$/,
  use: {
    loader: 'babel-loader',
    options: {
      plugins: [['babel-plugin-react-compiler', {}]],
    },
  },
}
```

React Compiler 必須是 Babel plugin 鏈的**第一個**。

## ESLint plugin:開 compiler 之前先開這個

```bash
npm i -D eslint-plugin-react-compiler
```

```js
// eslint.config.js
import reactCompiler from 'eslint-plugin-react-compiler'

export default [
  {
    plugins: { 'react-compiler': reactCompiler },
    rules: { 'react-compiler/react-compiler': 'error' },
  },
]
```

這 plugin 會事先抓出 compiler 會跳過的 code(mutation、conditional hooks、render 內讀 ref 等)。**CI 先跑 ESLint、通過再開 compiler**,避免 compiler 靜默跳過大半 component。

## React Compiler 假設你守了哪些規則

Compiler 假設你遵守「Rules of React」:

- **Render 是 pure 的**:不能有 side effect、不能 `Math.random()`、不能打 API
- **Immutability**:props、state、hook return value、上一輪 render 的值都不能 mutate
- **Rules of Hooks**:只能 top-level 呼叫、順序每次一樣
- **Ref** 只能在 effect / handler 讀寫,不能在 render 內

違反時的行為:**單一 component 被跳過,不是整個 build 爆**。所以問題會**靜默潛伏**——compiler 沒幫你優化,你以為有,實際沒有。ESLint plugin 就是抓這個用的。

## 漸進導入:compilationMode

全開有風險,官方建議分階段:

| 模式 | 行為 |
|------|------|
| `'all'`(預設) | 全部 component 都編譯 |
| `'annotation'` | 只編譯有 `"use memo"` 指示詞的 component |
| `'infer'` | 用 heuristic 自動挑 |

漸進策略:

1. React 升到 19(或 17/18 配 `react-compiler-runtime`)
2. 裝 ESLint plugin,全專案修乾淨
3. `compilationMode: 'annotation'`,關鍵路徑加 `"use memo"` 測水溫
4. 確定穩了改 `'all'`,打開 DevTools 看每個 component 有沒有 ✨ 徽章
5. **舊的 useMemo / useCallback 不用急著刪**——compiler 是增量的,手寫 memo 照樣能跑,profiling 確認多餘了再刪

**指示詞 escape hatch**:

```jsx
function Weirdo() {
  "use no memo"   // 告訴 compiler 跳過這個 component
  // ...
}
```

適合臨時 workaround,不應該長期留。

## 除錯三寶

**1. React DevTools 徽章**
成功編譯的 component 會在 Components tab 顯示 **Memo ✨**。沒看到就代表 compiler 跳過,回頭看 ESLint 輸出。

**2. React Compiler Playground**
<https://playground.react.dev> 貼 component 進去,馬上看編譯輸出跟 bailout reason。對付「為什麼我這個沒被優化」超快。

**3. plugin 的 logger option**
```js
babelConfig: reactCompilerPreset({
  logger: {
    logEvent(filename, event) {
      console.log(filename, event)
    },
  },
})
```
開發時把每個編譯事件打出來,找問題很直觀。

## 實際效能提升

React 官方 blog 給的數字(Meta production):

- Instagram 重畫面 render 時間降 **~12%**
- Quest Store 導航 re-render 次數少 **2.5 倍**

合成測試的結論:**對「孩子很貴、但 parent 每 frame 都在 re-render」這種場景收益最大**。leaf component、已經精心 memo 的 code 不會變多快。別期待所有 component 通通飛起來。

## 踩過的雷

**Vite 8 + v6 的順序**:`babel()` 必須在 `react()` 之前。倒過來 compiler 不會跑,只有 oxc 的 JSX 轉譯。

**Next.js 重複編譯**:Next 已經開了別再手動加 Babel plugin。

**測試環境**:Jest / Vitest 如果沒同步配 Babel transform,測試裡的 component 不會被編譯——正常,但某些 fixture 故意 mutate 做測試時會被 ESLint 擋,加 `"use no memo"` 跳過。

**Storybook / MDX**:排除 `.stories.*` 以免 story 違反 Rules of React。

**Source maps**:Vite 設 `sourcemap: true`,不然編譯後的 `_c()` slot 程式碼在 devtools 裡很難讀。

## 結語

React Compiler 1.0 GA + Vite 8 + `@vitejs/plugin-react` v6 三個變化撞在 2025 年底到 2026 初,網路上舊教學多到踩雷。核心重點:

- Vite 8 + v6:`@rolldown/plugin-babel` + `reactCompilerPreset()`
- Vite 7 以下:舊 `react({ babel: {...} })` 寫法
- ESLint 先上,CI 把關
- `'annotation'` 模式漸進導入,不要一次全開
- `useMemo` / `useCallback` 不用大刪除,compiler 是增量的

最值得的投資是先接 ESLint plugin——就算還沒開 compiler,把 Rules of React 違反處修完,未來開 compiler 就幾乎不用煩惱。

## 參考資源

- [React Compiler 官方文件](https://react.dev/learn/react-compiler)
- [React Compiler 1.0 發布](https://react.dev/blog/2025/10/07/react-compiler-1)
- [@vitejs/plugin-react v6 release notes](https://github.com/vitejs/vite-plugin-react/releases)
- [React Compiler Playground](https://playground.react.dev)
- [Next.js reactCompiler 設定](https://nextjs.org/docs/app/api-reference/next-config-js/reactCompiler)
