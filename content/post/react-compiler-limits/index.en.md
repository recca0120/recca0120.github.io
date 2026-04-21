---
title: "3 Things React Compiler Won't Auto-Memo: From 512ms Down to 6ms"
description: "I thought React Compiler meant no more manual memo. Then tab-switch took 512ms. Three compiler blind spots — child component boundaries, prop identity intent, and setInterval animation state — with extra everyday examples."
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

"React Compiler auto-memos everything — I don't need manual optimization, right?" That was me six months ago. Then a teammate reported tab switching was laggy. I opened React DevTools Profiler and recorded a **single commit at 512ms**. Cold sweat.

The project runs React 19 + React Compiler 1.0. In theory, `useMemo`, `useCallback`, and `React.memo` are all automatic. In practice, profile showed compiler missed every hot path.

This is my walk through three fixes that took the app from 512ms to 6ms, and why compiler couldn't help for each. Each section ends with extra examples you're likely to hit in your own codebase — not just the one I was debugging.

> [!IMPORTANT]
> Compiler does more than you think. While writing this post I used `babel-plugin-react-compiler` to compile actual code and verify which patterns *really* need manual memoization. Many cases where "adding `useMemo` seems useful" are already handled by the compiler — hook returns like `{ ...state, ...actions }`, `.filter()` results, or `{...DEFAULT, ...overrides}` merges are all auto-memoized. **The three boundaries below are where you actually need to step in** — don't sprinkle `useMemo` everywhere else.

## The pain: 512ms tab switch

The app is a multi-tab workspace: project list on the left, tabs on top, a scrollable feed in the main area. Each tab lives under a deep provider tree (~15 Context.Providers — auth, settings, messages, realtime notifications, etc.). Each feed item runs Markdown parsing + syntax highlighting, so render cost per item is non-trivial.

User clicks a different tab. React DevTools Profiler records:

```
Render: 512.6ms
What caused this update? TabProvider

TabProvider (0.2ms of 512.6ms)
├─ WorkspacePanel (0.3ms of 512.4ms)
│  ├─ TabPanel key="...tab-1" (220ms)  ← tab 1 full re-render
│  ├─ TabPanel key="...tab-2" (150ms)  ← tab 2 full re-render
│  └─ TabPanel key="...tab-3" (140ms)  ← tab 3 full re-render
```

All three tabs stay mounted (toggled via CSS so we don't rebuild state), so one click triggers **all three subtrees to re-render**, and each tab's feed runs Markdown + syntax highlighting across N items.

React Compiler is enabled. It isn't helping. Why?

## Boundary 1: compiler can't express "don't include this prop in identity"

The first thing I caught was that TabProvider's `actions` got a new identity on every render.

Original code:

```tsx
export function TabProvider({ cwd, children }: { cwd?: string; children: ReactNode }) {
  const [state, setState] = useState<TabState>({ tabs: {}, activeTabId: null });

  const addTab = (id: string) => {
    setState((prev) => ({ ...prev, tabs: { ...prev.tabs, [id]: DEFAULT_META } }));
  };

  const createNewTab = () => {
    const channelId = crypto.randomUUID();
    setState((prev) => ({
      tabs: { ...prev.tabs, [channelId]: { ...DEFAULT_META, cwd } }, // ← uses prop
      activeTabId: channelId,
    }));
    return { channelId };
  };

  // ... 6 more actions

  const actions = { addTab, createNewTab /* ... */ };

  return <TabActionsContext.Provider value={actions}>{children}</TabActionsContext.Provider>;
}
```

The compiler memoizes, but it sees `createNewTab`'s closure capture `cwd` and **conservatively adds `cwd` to the dependency set of `actions`**. When `cwd` changes (switching projects), `actions` gets a new identity → `<TabContent actions={actions}>` re-renders across the whole tree even if wrapped in `React.memo`.

The issue is one of intent: **`cwd`'s value only matters at the moment `createNewTab` is *called*, not when defined**. `addTab` doesn't use `cwd` at all, but it gets dragged along because it's in the same `actions` object.

This is the compiler's blind spot: **"I want `cwd` to be read at call time, not included in the identity" is an intent-level piece of information that can't be expressed in code**, so the compiler falls back to the conservative answer.

Fix: pin `actions` once with a `useState` initializer, and route the prop through a ref so it's read fresh at call time.

```tsx
export function TabProvider({ cwd, children }: { cwd?: string; children: ReactNode }) {
  const [state, setState] = useState<TabState>({ tabs: {}, activeTabId: null });

  const cwdRef = useRef(cwd);
  cwdRef.current = cwd; // sync on every render

  const [actions] = useState(() => ({
    addTab: (id: string) => {
      setState((prev) => ({ ...prev, tabs: { ...prev.tabs, [id]: DEFAULT_META } }));
    },
    createNewTab: () => {
      const channelId = crypto.randomUUID();
      setState((prev) => ({
        tabs: { ...prev.tabs, [channelId]: { ...DEFAULT_META, cwd: cwdRef.current } },
        activeTabId: channelId,
      }));
      return { channelId };
    },
    // ... 6 more actions
  }));

  return <TabActionsContext.Provider value={actions}>{children}</TabActionsContext.Provider>;
}
```

The `useState(() => ({...}))` initializer runs once — `actions` keeps the same reference for the entire lifetime. `cwdRef.current` is synced every render, so whenever an action runs it reads the current value.

Now `memo(TabContent)` can finally do its job — when switching projects, `TabProvider` itself re-renders, but `actions` is stable → TabContent's props are stable → memo short-circuits → the whole subtree skips re-render.

### When this pattern is warranted

Not every prop needs this workaround. The ref-capture pattern fits when:

- **An action needs to read the prop's current value at call time**, but you don't want the action's identity to change when the prop does
- **Prop change frequency ≫ call frequency** (like `cwd` changing on every project switch, but `createNewTab` getting called once per session)
- **Something downstream relies on identity for short-circuiting** (`React.memo` prop compare, `useEffect` deps)

Conversely, if nobody compares the action's identity, or the prop barely ever changes, don't bother. Over-using refs makes the timing relationship between prop and action harder to follow.

> [!NOTE]
> The compiler's dependency inference is conservative — if a closure reads a variable, it's treated as a dependency. "Keep this variable out of the deps" can only be expressed via runtime indirection (like refs), because it isn't something code itself can convey.

## Boundary 2: child components are not auto-wrapped in `React.memo`

After fixing TabProvider's `actions` identity, re-ran the profile. TabProvider's own render kept `actions` stable — but WorkspacePanel still re-rendered twice per tab switch.

The reason: WorkspacePanel's own context subscriptions didn't change, but its **parent re-rendered**. React's default is parent render → child re-run, unless the child is `React.memo`.

React Compiler 1.0 memoizes JSX elements, object literals, and callbacks inside a component. But it **does not automatically wrap child components in `React.memo`**. This is an intentional design boundary — auto-wrapping every component could break code relying on reference equality or intentional re-renders.

> [!NOTE]
> The official docs say the compiler "effectively memoizes the whole tree" — that refers to JSX and values *inside* each component. Bail-out at component boundaries still requires `React.memo`'s shallow prop comparison.

Fix: manually `React.memo` the hot-path components.

```tsx
export const WorkspacePanel = memo(function WorkspacePanel() {
  const { activeTabId, tabs } = useTabState();
  // ...
});
```

WorkspacePanel takes no props. After memo, it only re-renders when its context subscriptions actually change.

### When manual `React.memo` is worth it

Not every component should be memoized — shallow comparison isn't free, and overuse adds noise. In practice, three cases pay off:

**1. Expensive-to-render leaf components**

```tsx
const FeedItem = memo(function FeedItem({ post }: { post: Post }) {
  const rendered = useMarkdownToReact(post.body);   // Markdown → React nodes
  const highlighted = useSyntaxHighlight(rendered); // shiki / prism
  return <article>{highlighted}</article>;
});
```

In a list of 100 items, any parent change re-renders all 100 — even if content didn't change, Markdown re-parses. memo makes only the changed post re-render.

**2. Containers whose props are usually stable**

```tsx
const SettingsPanel = memo(function SettingsPanel({ userId }: { userId: string }) {
  // refetches only when userId changes
});
```

**3. Gateways at the top of deep provider trees**

If you know a component sits above a huge subtree or chain of Providers, and its props / context rarely change, memo-ing it is a cheap short-circuit gate for that entire subtree.

Conversely, components whose props always change (e.g. receiving `onClick`, `style`, or `children` fresh each render) get no benefit — the shallow compare fails every time. Fix prop identity first (see Boundary 1).

## Boundary 3: high-frequency setInterval + setState animations

This was the sneakiest. Same profile session showed **366 commits** — each averaging 4.5ms, but cumulatively saturating the main thread.

"What caused this update?" pointed to a single component: `LoadingSpinner` — the loading indicator cycling through `· ✢ * ✶ ✻ ✽`.

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

`setState` every 120ms = 8 commits per second. Each commit walks the fiber tree, checks memos, schedules effects. **Even when every parent bails out, the tree walk itself costs CPU**. Over the loading window, 8× per second compounds into sustained background load.

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

ref + `textContent =` is native DOM manipulation. React never sees the update, so it never commits. Background commit frequency during loading dropped from **~8/sec to ~0.2/sec**.

### Other "high-frequency state blowing up commits" patterns

Same idea applies to:

**Mouse follower:**

```tsx
// ❌ mousemove fires 60+ times per second
const [pos, setPos] = useState({ x: 0, y: 0 });
useEffect(() => {
  const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
  window.addEventListener('mousemove', onMove);
  return () => window.removeEventListener('mousemove', onMove);
}, []);
return <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} />;

// ✅ write style directly, bypass React
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

**Scroll progress indicator:**

```tsx
// ❌ setState on every scroll event
const [progress, setProgress] = useState(0);
useEffect(() => {
  const onScroll = () => setProgress(window.scrollY / document.body.scrollHeight);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}, []);
```

Scroll can fire hundreds of times per second. Routing that through state = hundreds of commits per second across the whole subtree. Use ref + `style.width` or a CSS custom property instead.

**Countdown timer (display only):**

```tsx
// ❌ setState every second, forces a tree walk
const [remaining, setRemaining] = useState(60);
useEffect(() => {
  const id = setInterval(() => setRemaining((r) => r - 1), 1000);
  return () => clearInterval(id);
}, []);
```

If the countdown is purely visual — no other component branches on the current second — ref + `textContent` is much cheaper. If logic depends on time (auto-submit at zero), then state makes sense.

> [!TIP]
> Rule of thumb: does this value affect **React's render logic**? If it's only visual and no component branches on it, bypass React and touch the DOM directly.

## Result: 512ms → 6ms

After all three fixes landed, re-profile:

| Action | Before | After |
|---|---|---|
| Tab switch | 512ms | 4ms |
| Project switch | 580ms | 6.6ms |
| Loading background commits | 8/sec | 0.2/sec |

Tab switch went from noticeably laggy to essentially instant. Other interactions (submit, open panel) also improved — they share the provider tree with tab switching, so killing the background noise lifted everything.

## What the compiler actually does (don't duplicate useMemo)

While writing this post I did one thing: fed various patterns to `babel-plugin-react-compiler` and inspected the output to verify which patterns truly need manual memoization. The answer is that many cases where you'd reach for `useMemo` are already handled.

### Spread / filter / merge inside hooks — no need to add

```tsx
export function useSession() {
  const state = useContext(StateCtx);
  const actions = useContext(ActionsCtx);
  if (!state || !actions) throw new Error('...');
  return { ...state, ...actions }; // compiler memoizes on [state, actions]
}
```

Here's what the compiler actually produces:

```js
// after compile
let t0;
if ($[0] !== actions || $[1] !== state) {
  t0 = { ...state, ...actions };
  $[0] = actions;
  $[1] = state;
  $[2] = t0;
} else {
  t0 = $[2]; // reuse cache
}
return t0;
```

Same treatment applies to `items.filter(...)` and `{ ...DEFAULT, ...overrides }` — all auto-memoized. The `useMemo` I'd originally added around `useSession` was pure redundancy — the compiler output confirmed it already does the same thing.

### Inline objects in Provider values — no need to add

```tsx
// these two compile to identical code
return <Ctx.Provider value={{ socket }}>{children}</Ctx.Provider>;

// vs
const value = useMemo(() => ({ socket }), [socket]);
return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
```

I compiled both sources and the resulting `_c(5)` cache slot allocation and `if ($[0] !== socket)` dependency check were identical. Adding `useMemo` yourself only looks different in the source — post-compile it's identical.

### Takeaway

When you're tempted to reach for `useMemo`, order of operations:

1. Profile first — is there actually a render issue?
2. If so, identify which of the 3 boundaries above (prop captured into identity, missing memo boundary, high-frequency commits)
3. **If it's none of the 3**, the compiler usually already handles it — don't add memo on guess

If you want to be sure, install `babel-plugin-react-compiler` and run it against a small probe file — reading the output is the most reliable way to confirm.

## Other compiler blind spots worth knowing

Beyond the three above, the community and official docs have surfaced these situations where compiler also can't help:

- **Mutating props or objects during render**: compiler detects mutation and skips optimizing that code — safety can't be guaranteed.
- **Reading refs during render**: `ref.current` isn't tracked by the compiler and can't participate in memo dependencies.
- **Sharing expensive computation across components**: compiler memoization is per-component. Three different components computing the same result from the same input will each run it once. Cache outside with `useMemo` + a shared map, or lift the computation higher.
- **List virtualization**: compiler won't virtualize a 10,000-item list for you. That's an architectural choice.

## The actual edges of React Compiler

From this debugging session:

| Compiler does auto | Compiler does NOT auto |
|---|---|
| `useMemo` equivalent inside a component | Wrap child components in `React.memo` |
| `useCallback` equivalent inside a component | Express "this prop should not be in identity" intent |
| Memoize JSX elements | Decide which animations belong in DOM vs React state |
| Stabilize inline object literals / spread / merge | Analyze re-render cost across a provider chain |
| Memoize hook return values | Cache expensive computation shared across components |

One sentence: **Compiler eliminates ~90% of intra-component memo boilerplate, but component-boundary and architectural optimizations remain your job**.

My wrong mental model was "compiler enabled = free performance." Reality is closer to "compiler enabled = no more boilerplate, but hot spots still need profile-driven manual optimization."

## Practical advice

- **Don't guess. Profile first.** I wasted time assuming the list needed virtualization — spent hours on it before realizing the real culprit was LoadingSpinner's interval. Ten minutes with Profiler saves a day of guesswork.
- **React DevTools Profiler's "What caused this update?"** is the most direct clue. Trace the trigger, walk up to the root cause.
- **When unsure whether a pattern needs `useMemo`, compile it and look.** Install `babel-plugin-react-compiler`, a 30-line node script running babel transform tells you whether the compiler already handles it. Much more reliable than guessing.
- **Manually `React.memo` the hotspots**: leaf components called by high-frequency parents, expensive-to-render items (Markdown, syntax highlighting), and boundaries between deep provider trees.
- **High-frequency animations go through refs + DOM**: mousemove, scroll, interval icons, countdown displays — any visual-only state should bypass React.

React Compiler is worth using. The boilerplate it saves is significant, and day-to-day you can stop thinking about memo. But enabling it doesn't mean you can stop caring. Profile-driven, targeted manual optimization complements the compiler — it doesn't replace it.

## References

- [React Compiler documentation](https://react.dev/learn/react-compiler)
- [React Compiler v1.0 release post](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React DevTools Profiler guide](https://react.dev/reference/react/Profiler)
- [React.memo API reference](https://react.dev/reference/react/memo)
- [useMemo API reference](https://react.dev/reference/react/useMemo)
