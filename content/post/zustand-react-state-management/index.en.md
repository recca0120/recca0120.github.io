---
title: 'Zustand: React State Management Without Providers or Reducers'
date: '2026-03-13T09:00:00+08:00'
slug: zustand-react-state-management
image: featured.jpg
description: 'Zustand is a 1KB React state management library. One create() call handles state and actions, no Provider wrapping needed, selectors prevent unnecessary re-renders, with built-in persist, devtools, and immer middleware.'
categories:
  - Frontend
tags:
  - zustand
  - react
  - state-management
  - typescript
  - javascript
---

Redux needs action types, action creators, reducers, and a `<Provider>` wrap — adding a counter touches four files.
React Context is convenient, but any value change in the context re-renders every consumer.
[Zustand](https://github.com/pmndrs/zustand) handles it with one `create()` call. 1KB, no Provider needed.

## The Problem with Context

The issue with Context is re-rendering.

```tsx
const AppContext = createContext({ user: null, theme: 'light', count: 0 });

function ThemeDisplay() {
  const { theme } = useContext(AppContext);
  // Re-renders every time count changes, even though this component doesn't use it
  return <span>{theme}</span>;
}
```

Context wasn't designed for high-frequency state updates. It's fine for theme or locale — things that rarely change. For UI state it's slow, and optimizing it means reaching for `useMemo` and split contexts, which compounds complexity fast.

## Installation

```bash
npm install zustand

# Optional: for clean nested state updates
npm install immer
```

## Creating a Store

```typescript
import { create } from 'zustand';

interface BearStore {
  bears: number;
  honey: number;
  increasePopulation: () => void;
  addHoney: (amount: number) => void;
  removeAllBears: () => void;
}

const useBearStore = create<BearStore>()((set) => ({
  bears: 0,
  honey: 100,
  increasePopulation: () => set((state) => ({ bears: state.bears + 1 })),
  addHoney: (amount) => set((state) => ({ honey: state.honey + amount })),
  removeAllBears: () => set({ bears: 0 }),
}));
```

TypeScript requires `create<BearStore>()(...)` with double parentheses. This is intentional — it enables correct generic inference, not a typo.

## Reading State: Selectors Subscribe to Only What You Need

```tsx
function BearCounter() {
  // Only re-renders when `bears` changes
  const bears = useBearStore((state) => state.bears);
  return <h1>{bears} bears</h1>;
}

function Controls() {
  // Actions don't change, so this component almost never re-renders
  const increasePopulation = useBearStore((state) => state.increasePopulation);
  return <button onClick={increasePopulation}>Add bear</button>;
}
```

The contrast with Context is clear: `BearCounter` subscribes only to `bears`. Changes to `honey` don't trigger a re-render here.

## Selecting Multiple Fields: useShallow

Selectors that return a new object on every call cause infinite re-renders. Use `useShallow` for shallow comparison:

```typescript
import { useShallow } from 'zustand/react/shallow';

// Wrong: returns a new object every render → infinite re-render loop
const { bears, honey } = useBearStore((state) => ({
  bears: state.bears,
  honey: state.honey,
}));

// Correct: useShallow compares keys and values shallowly
const { bears, honey } = useBearStore(
  useShallow((state) => ({ bears: state.bears, honey: state.honey }))
);
```

## Async Actions

No special handling required — plain `async/await`:

```typescript
interface UserStore {
  users: User[];
  isLoading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
}

const useUserStore = create<UserStore>()((set, get) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/users');
      const users: User[] = await res.json();
      set({ users, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },
}));
```

Compare this to Redux's `createAsyncThunk` — no `pending`/`fulfilled`/`rejected` cases, no `builder.addCase`. Just an async function.

## Reading and Writing State Outside React

This is something Context can't do:

```typescript
// Read from a service, utility, or non-React code
const currentBears = useBearStore.getState().bears;
useBearStore.getState().increasePopulation();

// Write directly
useBearStore.setState({ bears: 10 });

// Subscribe to changes (remember to clean up)
const unsubscribe = useBearStore.subscribe(
  (state) => state.bears,
  (bears) => console.log('bears changed to', bears)
);
```

WebSocket handlers, timers, and third-party SDK callbacks can all interact with the store directly, without any React wrappers.

## Immer Middleware: Clean Nested Updates

Without immer, updating nested state requires spreading every level manually:

```typescript
// Without immer
set((state) => ({
  profile: {
    ...state.profile,
    settings: {
      ...state.profile.settings,
      theme: 'dark',
    },
  },
}));
```

With immer, write mutations directly:

```typescript
import { immer } from 'zustand/middleware/immer';

const useStore = create<Store>()(
  immer((set) => ({
    profile: { name: 'Alice', settings: { theme: 'light' } },
    todos: [],

    updateTheme: (theme) =>
      set((state) => {
        state.profile.settings.theme = theme;  // direct mutation, immer handles immutability
      }),

    addTodo: (text) =>
      set((state) => {
        state.todos.push({ id: Date.now(), text, done: false });
      }),

    toggleTodo: (id) =>
      set((state) => {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) todo.done = !todo.done;
      }),
  }))
);
```

## Devtools Middleware

Integrates with the Redux DevTools browser extension — no Redux required:

```typescript
import { devtools } from 'zustand/middleware';

const useCounterStore = create<CounterStore>()(
  devtools(
    (set) => ({
      count: 0,
      increment: () =>
        set(
          (state) => ({ count: state.count + 1 }),
          false,
          'counter/increment'  // action name shown in DevTools timeline
        ),
    }),
    {
      name: 'CounterStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
```

The third argument to `set()` is the action name — it shows up in the DevTools timeline, which makes debugging much easier.

## Persist Middleware: Automatic localStorage

```typescript
import { persist, createJSONStorage } from 'zustand/middleware';

const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'light' as 'light' | 'dark',
      language: 'en',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'app-settings',  // localStorage key
      storage: createJSONStorage(() => localStorage),

      // Persist only specific fields (keep sensitive data out)
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
      }),

      // Version for schema migration
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) {
          return { ...(persisted as object), language: 'en' };
        }
        return persisted as SettingsStore;
      },
    }
  )
);
```

After a page reload, `theme` and `language` restore automatically from localStorage.

## Slice Pattern: Splitting Large Stores

Zustand recommends a single global store, but you can split it into logical slices:

```typescript
// stores/slices/bearSlice.ts
import { StateCreator } from 'zustand';

export interface BearSlice {
  bears: number;
  addBear: () => void;
  eatFish: () => void;
}

export const createBearSlice: StateCreator<
  BearSlice & FishSlice,  // full store type (for cross-slice access)
  [],
  [],
  BearSlice
> = (set) => ({
  bears: 0,
  addBear: () => set((state) => ({ bears: state.bears + 1 })),
  eatFish: () => set((state) => ({ fishes: state.fishes - 1 })),  // cross-slice update
});
```

```typescript
// stores/slices/fishSlice.ts
export interface FishSlice {
  fishes: number;
  addFish: () => void;
}

export const createFishSlice: StateCreator<
  BearSlice & FishSlice,
  [],
  [],
  FishSlice
> = (set) => ({
  fishes: 0,
  addFish: () => set((state) => ({ fishes: state.fishes + 1 })),
});
```

```typescript
// stores/useBoundStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type BoundStore = BearSlice & FishSlice;

export const useBoundStore = create<BoundStore>()(
  devtools(
    (...args) => ({
      ...createBearSlice(...args),
      ...createFishSlice(...args),
    }),
    { name: 'BoundStore' }
  )
);
```

Apply `devtools`, `persist`, and `immer` at the combined store level only — not inside individual slices.

## Middleware Composition Order

Middleware wraps from outside in. `devtools` belongs outermost so it can observe all state changes:

```typescript
const useStore = create<MyStore>()(
  devtools(       // outermost — sees everything
    persist(
      immer(
        (set) => ({ /* ... */ })
      ),
      { name: 'my-store' }
    ),
    { name: 'MyStore' }
  )
);
```

## Zustand vs Redux Toolkit vs Context

| | Zustand | Redux Toolkit | React Context |
|--|--|--|--|
| Bundle size | ~1KB | ~10-12KB | Built-in |
| Requires Provider | No | Yes | Yes |
| Boilerplate | Minimal | Moderate | Low |
| Async | Plain async functions | createAsyncThunk | Manual loading state |
| Re-render control | Precise via selectors | useSelector | All consumers re-render |
| DevTools | opt-in middleware | Built-in | None |
| Persistence | opt-in middleware | Manual | Manual |
| Outside React access | ✓ | ✓ (dispatch) | ✗ |

**Choose Zustand**: almost all React apps for client state.
**Choose Redux Toolkit**: large teams needing strict conventions, existing Redux ecosystem.
**Choose Context**: global values that rarely change — theme, locale, current user.

## Summary

Zustand doesn't change the concepts — state, actions, updates all work the same way. It just removes the ceremony. One `create()` call, add the middleware you need, and you have a complete state management solution.

If your project uses Context for frequently-updating state, or Redux feels like too much setup for what you're doing, Zustand is worth the switch.

## References

- [Zustand official documentation](https://zustand.docs.pmnd.rs/)
- [Zustand GitHub repository](https://github.com/pmndrs/zustand)
- [Immer official documentation (immutable state update helper)](https://immerjs.github.io/immer/)
- [Redux DevTools browser extension](https://github.com/reduxjs/redux-devtools)
