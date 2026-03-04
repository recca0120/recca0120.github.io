---
title: 'Zustand：React 狀態管理，不需要 Provider，不需要 Reducer'
date: '2026-03-13T09:00:00+08:00'
slug: zustand-react-state-management
description: 'Zustand 是 1KB 的 React 狀態管理庫，一個 create() 搞定 state 和 action，不需要 Provider 包裝，selector 自動避免多餘 re-render，內建 persist、devtools、immer middleware。'
categories:
  - 前端
tags:
  - zustand
  - react
  - state-management
  - typescript
  - javascript
---

Redux 要寫 action type、action creator、reducer，還要包 `<Provider>`，加一個 counter 要改四個地方。
React Context 用起來方便，但只要 context 裡任何一個值變動，所有 consumer 都重新渲染。
[Zustand](https://github.com/pmndrs/zustand) 一個 `create()` 就解決，1KB，不需要 Provider。

## 為什麼不用 Context

Context 的問題在 re-render。

```tsx
const AppContext = createContext({ user: null, theme: 'light', count: 0 });

function ThemeDisplay() {
  const { theme } = useContext(AppContext);
  // count 每次變動，這個元件也重新渲染，即使它根本不用 count
  return <span>{theme}</span>;
}
```

Context 的設計本來就不是為了高頻更新的狀態，它適合 theme、locale 這種很少變的東西。用來管 UI 狀態效能很差，而且要優化要靠 `useMemo` 和拆分 context，越來越複雜。

## 安裝

```bash
npm install zustand

# 深度更新 nested state 用（非必要）
npm install immer
```

## 建立 Store

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

TypeScript 要用 `create<BearStore>()(...)` 雙括號，這是為了讓泛型正確推斷，不是打錯。

## 讀取 State：Selector 只訂閱需要的部分

```tsx
function BearCounter() {
  // 只有 bears 變動時這個元件才重新渲染
  const bears = useBearStore((state) => state.bears);
  return <h1>{bears} 隻熊</h1>;
}

function Controls() {
  // action 不會變動，這個元件幾乎不重新渲染
  const increasePopulation = useBearStore((state) => state.increasePopulation);
  return <button onClick={increasePopulation}>加一隻熊</button>;
}
```

這跟 Context 的差別很明顯：`BearCounter` 只訂閱 `bears`，`honey` 變動不會觸發它重新渲染。

## 同時取多個欄位：useShallow

Selector 回傳新物件會造成無限 re-render，用 `useShallow` 做淺比較：

```typescript
import { useShallow } from 'zustand/react/shallow';

// 錯誤：每次都回傳新物件 → 無限 re-render
const { bears, honey } = useBearStore((state) => ({
  bears: state.bears,
  honey: state.honey,
}));

// 正確：useShallow 做 key/value 淺比較
const { bears, honey } = useBearStore(
  useShallow((state) => ({ bears: state.bears, honey: state.honey }))
);
```

## Async Action

不需要任何特殊處理，直接 `async/await`：

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

跟 Redux 的 `createAsyncThunk` 比，不用設定 `pending`/`fulfilled`/`rejected`，就是一個普通的 async function。

## 在元件外讀寫 State

這是 Context 做不到的：

```typescript
// 在 service、utils 或非 React 的地方直接讀
const currentBears = useBearStore.getState().bears;
useBearStore.getState().increasePopulation();

// 直接寫入
useBearStore.setState({ bears: 10 });

// 訂閱變動（記得 cleanup）
const unsubscribe = useBearStore.subscribe(
  (state) => state.bears,
  (bears) => console.log('bears 變為', bears)
);
```

WebSocket handler、定時器、第三方 SDK callback 都能直接操作 store，不需要繞過 React。

## Immer Middleware：深層更新不再痛苦

沒有 immer，更新 nested state 要手動展開每一層：

```typescript
// 沒有 immer：更新 nested state
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

加了 immer，直接 mutation：

```typescript
import { immer } from 'zustand/middleware/immer';

const useStore = create<Store>()(
  immer((set) => ({
    profile: { name: 'Alice', settings: { theme: 'light' } },
    todos: [],

    updateTheme: (theme) =>
      set((state) => {
        state.profile.settings.theme = theme;  // 直接寫，immer 處理 immutability
      }),

    addTodo: (text) =>
      set((state) => {
        state.todos.push({ id: Date.now(), text, done: false });  // 直接 push
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

整合 Redux DevTools 瀏覽器擴充套件，不需要裝 Redux：

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
          'counter/increment'  // DevTools 顯示的 action 名稱
        ),
    }),
    {
      name: 'CounterStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
```

第三個參數是 action 名稱，DevTools 時間軸上會顯示，debug 的時候很有用。

## Persist Middleware：自動存 localStorage

```typescript
import { persist, createJSONStorage } from 'zustand/middleware';

const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'light' as 'light' | 'dark',
      language: 'zh',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'app-settings',  // localStorage 的 key
      storage: createJSONStorage(() => localStorage),

      // 只 persist 部分欄位（敏感資料不存）
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
      }),

      // schema 版本號，改欄位結構時遷移舊資料
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) {
          return { ...(persisted as object), language: 'zh' };
        }
        return persisted as SettingsStore;
      },
    }
  )
);
```

頁面重整後 theme 和 language 會自動從 localStorage 恢復。

## Slice Pattern：拆分大型 Store

Zustand 建議用一個全域 store，但可以用 slice 拆成多個邏輯單元：

```typescript
// stores/slices/bearSlice.ts
import { StateCreator } from 'zustand';

export interface BearSlice {
  bears: number;
  addBear: () => void;
  eatFish: () => void;
}

export const createBearSlice: StateCreator<
  BearSlice & FishSlice,  // 完整的 store 型別（跨 slice 存取用）
  [],
  [],
  BearSlice
> = (set) => ({
  bears: 0,
  addBear: () => set((state) => ({ bears: state.bears + 1 })),
  eatFish: () => set((state) => ({ fishes: state.fishes - 1 })),  // 跨 slice
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

`devtools`、`persist`、`immer` 只在合併後的 store 上加，不要在各個 slice 內加。

## Middleware 組合順序

middleware 由外到內包裝，`devtools` 要放最外層才能觀察到所有狀態變動：

```typescript
const useStore = create<MyStore>()(
  devtools(        // 最外層，觀察所有東西
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
| 大小 | ~1KB | ~10-12KB | 內建 |
| 需要 Provider | 否 | 是 | 是 |
| Boilerplate | 最少 | 中等 | 少 |
| Async | 直接 async | createAsyncThunk | 手動管 loading |
| Re-render 控制 | selector 精確控制 | useSelector | 全部重渲染 |
| DevTools | middleware 加入 | 內建 | 無 |
| Persist | middleware 加入 | 無（要自己處理） | 無 |
| 元件外存取 | ✓ | ✓（dispatch） | ✗ |

用 Zustand 的時機：幾乎所有 React app 的 client state。
用 Redux Toolkit 的時機：大型團隊、需要嚴格規範、已有 Redux 生態系。
用 Context 的時機：theme、locale 這種幾乎不變的全域值。

## 小結

Zustand 改變的不是概念，而是儀式。state 在哪、action 在哪、怎麼更新，這些都沒變，只是不再需要繞那麼多彎。一個 `create()`，加上需要的 middleware，就是完整的狀態管理。

如果你的專案在用 Context 管有頻繁更新的狀態，或者覺得 Redux 的設定太繁瑣，Zustand 值得換。
