---
title: "3 Things React Compiler Won't Auto-Memo: From 512ms Down to 6ms"
description: "I thought React Compiler meant no more manual memo. Then tab-switch took 512ms. Three compiler blind spots: hook spreads, child component boundaries, and setInterval animation state — with profile-driven fixes."
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

"React Compiler auto-memos everything — I don't need manual optimization, right?" That was me six months ago. Then a user reported tab switching was laggy. I opened React DevTools Profiler and recorded a **single commit at 512ms**. Cold sweat.

The project runs React 19 + React Compiler 1.0. In theory, `useMemo`, `useCallback`, and `React.memo` are all automatic. In practice, profile showed compiler missed every hot path.

This is my walk through three fixes that took the app from 512ms to 6ms, and why compiler couldn't help for each.

## The pain: 512ms tab switch, 580ms project switch

Context: a web-based Claude Code client. Project list on the left, session tabs on top, MessageList displays the conversation. Each tab has a deep provider tree (~15 Context.Providers) including ChannelProvider, ChannelMessagesProvider, and so on.

User clicks a different session tab. React DevTools Profiler records:

```
Render: 512.6ms
What caused this update? TabProvider

TabProvider (0.2ms of 512.6ms)
├─ EditorArea (0.3ms of 512.4ms)
│  ├─ TabContent key="...tab-1" (220ms)  ← tab 1 full re-render
│  ├─ TabContent key="...tab-2" (150ms)  ← tab 2 full re-render
│  └─ TabContent key="...tab-3" (140ms)  ← tab 3 full re-render
```

All three tabs stay mounted (hidden via CSS). One click triggers **all three subtrees to re-render**, and each tab's MessageList runs Markdown + shiki highlighting across N ChatMessages.

React Compiler is enabled. It isn't helping. Why?

## Boundary 1: hook return spreads are new objects every call

First thing I spotted after adding debug logs:

```tsx
export function useSession(): SessionContextValue {
  const state = useContext(SessionStateContext);
  const actions = useContext(SessionActionsContext);
  if (!state || !actions) throw new Error('...');
  return { ...state, ...actions };  // ← new object every call
}
```

`state` and `actions` come from separate Contexts, each with stable identity. But `{ ...state, ...actions }` is a **fresh object literal** — recreated every time the hook runs.

I logged `sessionChanged` in EditorArea. Every render: `true`. Even when state itself didn't change, the spread produced a new reference, causing every downstream `useEffect([session])` and `React.memo` comparison to see "changed."

**Why didn't compiler fix this?** Compiler does intra-component memoization but treats hooks as black boxes. From the caller's perspective, `useSession()`'s output is dynamic. Compiler can't reason across the hook boundary to decide the spread should be memoized.

Fix: `useMemo` inside the hook.

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

After this, `sessionChanged` went to `false` everywhere.

> [!IMPORTANT]
> Compiler only memoizes computation inside one component. Spreads, object merges, or `.filter()` results that cross hook / function boundaries need manual `useMemo`.

## Boundary 2: child components are not auto-wrapped in `React.memo`

After fixing `useSession`, I re-ran the profile. All context-changed flags were false — but EditorArea still re-rendered twice per tab switch (two projects × two renders).

The reason: EditorArea's own context subscriptions didn't change, but its **parent re-rendered**. React's default behavior is parent render → child re-run, unless the child is `React.memo`.

React Compiler 1.0 memoizes JSX elements, object literals, and callbacks inside a component. But it **does not automatically wrap child components in `React.memo`**. This is an intentional design boundary — auto-wrapping every component could break code that relies on reference equality or forced re-renders.

Fix: manually `React.memo` the hot-path components.

```tsx
export const EditorArea = memo(function EditorArea() {
  const { activeTabId, tabs } = useTabState();
  // ...
});
```

EditorArea takes no props. After memo, it only re-renders when its context subscriptions actually change.

Same pattern applies to TabContent, ChatMessage, and other leaf components. Each change is under 20 lines, but the impact compounds.

## Boundary 3: high-frequency setInterval + setState animations

This one was the sneakiest. Same profile session showed **366 commits** — each averaging 4.5ms, but cumulatively saturating the main thread.

"What caused this update?" pointed to a single component: `SpinnerVerb`. The "thinking" indicator that cycles through `· ✢ * ✶ ✻ ✽`.

Original implementation:

```tsx
const [iconIndex, setIconIndex] = useState(0);

useEffect(() => {
  const id = setInterval(() => {
    setIconIndex((i) => (i + 1) % ICON_CYCLE.length);
  }, 120);
  return () => clearInterval(id);
}, []);
```

`setState` every 120ms = 8 commits per second. Each commit walks the fiber tree, checks memos, schedules effects. **Even when every parent bails out, the tree walk itself costs CPU**. Over the duration of processing, 8× per second compounds into sustained background load.

This isn't a memoization problem — it's a **commit frequency** problem. Compiler can't decide for you which animations should drive DOM directly versus go through React state. That's a design choice.

Fix: skip React entirely, write DOM directly.

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

ref + `textContent =` is native DOM manipulation. React never sees the update, so never commits. Background commit frequency during processing dropped from **~8/sec to ~0.2/sec** (only the occasional verb swap).

> [!TIP]
> Decorative animations — scramble text, rotating icons, pulses — are good candidates for this pattern. Keep React state for data.

## Result: 512ms → 6ms

After all three fixes landed, re-profile:

| Action | Before | After |
|---|---|---|
| Tab switch | 512ms | 4ms |
| Project switch | 580ms | 6.6ms |
| Processing background commits | 8/sec | 0.2/sec |

Tab switch went from noticeably laggy to essentially instant. Enter-to-send latency also improved — that pipeline shares the provider tree with tab switching, so killing the background noise lifted everything.

## The actual edges of React Compiler

From this debugging session:

| Compiler does auto | Compiler does NOT auto |
|---|---|
| `useMemo` equivalent inside a component | Wrap child components in `React.memo` |
| `useCallback` equivalent inside a component | Memoize hook return values across function boundaries |
| Memoize JSX elements | Decide which animations belong in DOM vs React state |
| Stabilize inline object literals | Analyze re-render cost across a provider chain |

One sentence: **Compiler eliminates ~90% of intra-component memo boilerplate, but component-boundary and architectural optimizations remain your job**.

My wrong mental model was "compiler enabled = free performance." Reality is closer to "compiler enabled = no more boilerplate, but hot spots still need profile-driven manual optimization."

> [!NOTE]
> The React team has said it themselves: compiler isn't a replacement for `React.memo`. It replaces the `useMemo` and `useCallback` you'd otherwise write inside components. High-level optimization strategy is still a developer call.

## Practical advice

- **Don't guess. Profile first.** I wasted time assuming MessageList needed virtualization — spent hours on it before realizing the real culprit was SpinnerVerb's interval. Ten minutes with Profiler saves a day of guesswork.
- **React DevTools Profiler's "What caused this update?"** is the most direct clue. Trace the trigger, walk up to the root cause.
- **`console.log` the hook return reference** is more productive than throwing `useMemo` at things. Confirm it's an identity drift problem before "fixing" anything.
- **Manually `React.memo` the hotspots**: leaf components called by high-frequency parents, expensive-to-render items (Markdown, syntax highlighting), and boundaries between deep provider trees.

React Compiler is worth using. The boilerplate it saves is significant, and day-to-day you can stop thinking about memo. But enabling it doesn't mean you can stop caring. Profile-driven, targeted manual optimization complements the compiler — it doesn't replace it.

## References

- [React Compiler documentation](https://react.dev/learn/react-compiler)
- [React DevTools Profiler guide](https://react.dev/reference/react/Profiler)
- [React.memo API reference](https://react.dev/reference/react/memo)
- [useMemo API reference](https://react.dev/reference/react/useMemo)
