---
title: 'React Compiler 1.0 + Vite 8: The Right Way to Install After @vitejs/plugin-react v6 Drops Babel'
description: 'React Compiler went 1.0 stable in October 2025, but @vitejs/plugin-react v6 swapped Babel for oxc at the same time — the old `react({ babel: {...} })` pattern no longer works on Vite 8. The correct 2026 install flow, ESLint setup, and a gradual adoption strategy.'
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

React Compiler reached **1.0 stable** in October 2025 — it auto-applies what `useMemo` / `useCallback` / `React.memo` do by hand. Most tutorials online still teach the old `react({ babel: { plugins: [...] } })` form, which **no longer works on Vite 8 + `@vitejs/plugin-react` v6**.

v6 made one big change: **internal Babel was dropped in favor of oxc**. JSX transform and Fast Refresh now run in Rust — much faster, but the tradeoff is that Babel plugins can no longer be passed through `react({ babel: {...} })`. To run Babel-based tools like React Compiler, you now need to add `@rolldown/plugin-babel` separately.

This post documents the correct 2026 install flow and how to use React Compiler itself.

## What React Compiler Actually Does

The most tedious part of writing React is **sprinkling memoization everywhere**. Children re-render, function references change, shallow comparison fails — solved by `useMemo` / `useCallback` / `React.memo`, but knowing *when* they help is an eyeball exercise.

React Compiler analyzes your components at build time and **inserts memoization where it belongs**.

Source:

```jsx
function TodoList({ items, filter }) {
  const visible = items.filter(i => i.tag === filter);
  const onClick = (id) => toggle(id);
  return <List items={visible} onClick={onClick} />;
}
```

Compiled (conceptual):

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
  // onClick and the JSX are cached the same way
  // ...
}
```

`_c()` is a slot cache from `react/compiler-runtime`. Granularity is **per-expression**, not per-component — finer than any hand-written useMemo.

## Status in April 2026

- **1.0 stable**: GA on 2025/10/7
- **Battle-tested**: ran at Meta scale (Instagram, Quest Store) for over a year pre-GA
- **React version**: 19 is native; 17 / 18 need `react-compiler-runtime`
- **Function components only**: class components are skipped

## Vite 8 + @vitejs/plugin-react v6 (the new way)

v6 removed Babel, so Babel-based plugins need `@rolldown/plugin-babel`:

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

Two things to notice:

1. **`reactCompilerPreset()` is exported from `@vitejs/plugin-react`** — it bundles `babel-plugin-react-compiler` with sane defaults so you don't hand-roll a preset.
2. **Order**: `babel()` before `react()`. The compiler must run before other transforms.

To stack other Babel plugins:

```js
babel({
  include: /\.[jt]sx?$/,
  babelConfig: {
    ...reactCompilerPreset(),
    plugins: ['@babel/plugin-proposal-throw-expressions'],
  },
})
```

## Vite 7 and below / @vitejs/plugin-react v5 (legacy)

If you haven't upgraded to Vite 8, the old form still works:

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

The two forms are incompatible across one major version. Most people who hit this wall pasted an old tutorial into a fresh Vite 8 project.

## Next.js 15.3.1+

Next bakes it in — no Babel wiring:

```js
// next.config.js
module.exports = {
  experimental: {
    reactCompiler: true,
  },
}
```

Install the plugin: `npm i babel-plugin-react-compiler`. To customize the mode:

```js
experimental: {
  reactCompiler: {
    compilationMode: 'annotation',
  },
}
```

**Heads up**: if Next.js enables the compiler, **don't also add the Babel plugin manually** — double compilation.

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

React Compiler must be the **first** plugin in the Babel chain.

## ESLint Plugin — Enable This Before the Compiler

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

This plugin surfaces violations the compiler would silently skip (mutation, conditional hooks, refs read during render). **Run ESLint in CI first, then enable the compiler** — otherwise the compiler quietly passes over half your components and you don't know it.

## Rules the Compiler Assumes

The compiler assumes you follow the Rules of React:

- **Pure render**: no side effects, no `Math.random()`, no fetches during render
- **Immutability**: don't mutate props, state, hook return values, or values from previous renders
- **Rules of Hooks**: only at the top level, same order each render
- **Refs**: read / write only in effects and handlers, never during render

Violations cause the compiler to **skip that single component, not crash the build**. The failure mode is **silent regression** — you think your component is optimized, it isn't. This is exactly what the ESLint plugin prevents.

## Gradual Adoption: compilationMode

Going full-on with a flip is risky. The docs recommend phasing:

| Mode | Behavior |
|------|----------|
| `'all'` (default) | Every component is compiled |
| `'annotation'` | Only components with `"use memo"` |
| `'infer'` | Heuristic selection |

Recommended path:

1. Upgrade React to 19 (or 17/18 + `react-compiler-runtime`)
2. Install the ESLint plugin, fix violations project-wide
3. `compilationMode: 'annotation'`, add `"use memo"` to critical paths, test the water
4. Once stable, switch to `'all'` and audit DevTools for the ✨ badge on every compiled component
5. **Don't rush to remove old `useMemo` / `useCallback`** — the compiler is additive; manual memo still works. Profile first, then delete file by file.

**Escape-hatch directive**:

```jsx
function Weirdo() {
  "use no memo"   // compiler skips this component
  // ...
}
```

Good for temporary workarounds, not a permanent home.

## Three Debugging Tools

**1. React DevTools badge**
Successfully compiled components show a **Memo ✨** badge in the Components tab. No badge? Compiler skipped — check ESLint output.

**2. React Compiler Playground**
<https://playground.react.dev> — paste a component, see compiled output and bailout reasons immediately. Fastest way to answer "why didn't this one get optimized."

**3. Plugin `logger` option**

```js
babelConfig: reactCompilerPreset({
  logger: {
    logEvent(filename, event) {
      console.log(filename, event)
    },
  },
})
```

Dump every compile event in dev — very direct when hunting down problems.

## Real-World Performance Numbers

Numbers from the React team's 1.0 post (Meta production):

- Instagram heavy screens: render time down **~12%**
- Quest Store navigation: **2.5× fewer** re-renders

Synthetic summary: **biggest wins when an expensive child is re-rendering because its parent re-renders every frame**. Leaf components and hand-optimized code won't get much faster. Don't expect the entire app to magically accelerate.

## Gotchas

**Vite 8 + v6 ordering**: `babel()` must come before `react()`. Reverse it and the compiler never runs, only oxc's JSX transform does.

**Next.js double compilation**: if Next has enabled it, don't add the Babel plugin manually.

**Test environments**: Jest / Vitest don't get the Babel transform by default, so components in tests aren't compiled — usually fine, but fixtures that intentionally mutate will trip ESLint. Add `"use no memo"` to those.

**Storybook / MDX**: exclude `.stories.*` files to avoid stories violating Rules of React.

**Source maps**: set `sourcemap: true` in Vite — the compiler's `_c()` slot code is painful to read in devtools without them.

## Closing

React Compiler 1.0 GA, Vite 8, `@vitejs/plugin-react` v6 all landed within months of each other in late 2025 / early 2026, and stale tutorials are everywhere. The essentials:

- Vite 8 + v6: `@rolldown/plugin-babel` + `reactCompilerPreset()`
- Vite 7 and below: classic `react({ babel: {...} })`
- ESLint first, CI before compiler
- `'annotation'` mode → `'all'`, not a single flip
- Don't bulk-delete `useMemo` / `useCallback`; the compiler is additive

The highest-value first step is the ESLint plugin — even before turning the compiler on, fixing Rules of React violations means almost zero surprises the day you flip the switch.

## References

- [React Compiler Official Docs](https://react.dev/learn/react-compiler)
- [React Compiler 1.0 Announcement](https://react.dev/blog/2025/10/07/react-compiler-1)
- [@vitejs/plugin-react v6 Release Notes](https://github.com/vitejs/vite-plugin-react/releases)
- [React Compiler Playground](https://playground.react.dev)
- [Next.js reactCompiler Config](https://nextjs.org/docs/app/api-reference/next-config-js/reactCompiler)
