---
title: 'Zod：TypeScript 最省力的資料驗證，Schema 即型別'
date: '2026-03-11T09:00:00+08:00'
slug: zod-typescript-validation
image: featured.jpg
description: 'Zod 是 TypeScript-first 的 schema 驗證庫，定義一次 schema 自動推斷型別，不用重複寫 interface。支援 parse/safeParse、transform、refine、discriminated union，2kb gzip，零依賴。'
categories:
  - Frontend
tags:
  - zod
  - typescript
  - validation
  - javascript
---

後端 API 回傳的資料，你有驗證嗎？
大多數人的做法是用 `as` 強制型別轉換，然後祈禱資料跟預期的一樣。
[Zod](https://zod.dev/) 讓你定義一次 schema，同時得到執行期驗證和 TypeScript 型別，不再靠信仰。

## 為什麼需要執行期驗證

TypeScript 的型別只存在編譯時，程式跑起來它就消失了。

```typescript
// TypeScript 不會擋住這個
const data = await fetch('/api/user').then(r => r.json()) as User;
console.log(data.name.toUpperCase()); // 如果 API 回傳 null，這裡就爆了
```

你寫了 `User` 型別，但 API 回傳的資料根本沒人驗證。Zod 的做法是：定義 schema，執行期解析，解析成功才拿到帶型別的資料。

## 安裝

```bash
npm install zod
```

需要 TypeScript 5.5+，`tsconfig.json` 要開 `"strict": true`。

## 基本用法

```typescript
import { z } from 'zod';

// 定義 schema
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// 從 schema 推斷型別，不用重複寫 interface
type User = z.infer<typeof UserSchema>;

// 解析資料
const data = UserSchema.parse({ id: 1, name: 'Alice', email: 'alice@example.com' });
// data 的型別是 User，完全型別安全
```

`z.infer<typeof UserSchema>` 這行是重點。schema 只寫一次，型別自動推斷出來，之後 schema 改了型別也跟著變，不需要同步維護兩份。

## parse vs safeParse

`parse` 失敗會丟出例外，`safeParse` 回傳結果物件：

```typescript
// parse：失敗時丟 ZodError
try {
  const user = UserSchema.parse(untrustedData);
} catch (e) {
  if (e instanceof z.ZodError) {
    console.log(e.issues); // 詳細的錯誤資訊
  }
}

// safeParse：不丟例外，用 result.success 判斷
const result = UserSchema.safeParse(untrustedData);
if (!result.success) {
  console.log(result.error.issues);
} else {
  const user = result.data; // 型別是 User
}
```

API handler 裡通常用 `safeParse`，不想讓驗證失敗炸掉整個 request。

## 字串驗證

```typescript
const schema = z.object({
  email: z.string().email(),
  url: z.string().url(),
  uuid: z.string().uuid(),
  username: z.string().min(3).max(20),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  bio: z.string().trim().max(200),   // 先 trim 再驗長度
});
```

常用格式都內建：`email()`、`url()`、`uuid()`、`ip()`、`datetime()`，不用自己寫 regex。

## 數字驗證

```typescript
const schema = z.object({
  age: z.number().int().min(0).max(120),
  price: z.number().positive(),
  rating: z.number().min(1).max(5).multipleOf(0.5),
});
```

## Object 操作

這是 Zod 最常用的場景，定義 API request/response 的結構：

```typescript
const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  age: z.number().optional(),          // 可以不傳
  bio: z.string().nullable(),          // 可以是 null
});

// 從 CreateUser 衍生出 UpdateUser（全部變成 optional）
const UpdateUserSchema = CreateUserSchema.partial();

// 只取部分欄位
const LoginSchema = CreateUserSchema.pick({ email: true, name: false });

// 排除部分欄位
const PublicUserSchema = CreateUserSchema.omit({ role: true });

// 擴充欄位
const UserWithIdSchema = CreateUserSchema.extend({
  id: z.number(),
  createdAt: z.date(),
});
```

## Array 和 Tuple

```typescript
// 字串陣列，至少一個元素
const TagsSchema = z.array(z.string()).min(1).max(10);

// Tuple：固定長度、每個位置型別不同
const CoordinateSchema = z.tuple([z.number(), z.number()]);
// 等於 [longitude, latitude]
```

## 預設值和轉換

```typescript
const ConfigSchema = z.object({
  timeout: z.number().default(5000),       // 沒傳就用 5000
  retries: z.number().default(3),
  baseUrl: z.string().default('https://api.example.com'),
});

// transform：解析後轉換資料
const DateSchema = z.string().transform(str => new Date(str));
// 輸入 string，輸出 Date

// coerce：自動型別轉換（處理表單資料很好用）
const AgeSchema = z.coerce.number().min(0);
// 輸入 "25"（string），輸出 25（number）
```

## 自訂驗證：refine

```typescript
// 簡單的自訂驗證
const PasswordSchema = z.object({
  password: z.string().min(8),
  confirm: z.string(),
}).refine(
  data => data.password === data.confirm,
  {
    message: '密碼不一致',
    path: ['confirm'],    // 錯誤歸屬到哪個欄位
  }
);

// superRefine：可以加多個錯誤
const PriceSchema = z.object({
  min: z.number(),
  max: z.number(),
}).superRefine((data, ctx) => {
  if (data.min >= data.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'min 必須小於 max',
      path: ['min'],
    });
  }
});
```

## Discriminated Union

當 API 回傳不同結構的資料，用 discriminated union 更有效率：

```typescript
const ApiResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: z.object({ id: z.number(), name: z.string() }),
  }),
  z.object({
    status: z.literal('error'),
    code: z.number(),
    message: z.string(),
  }),
]);

type ApiResponse = z.infer<typeof ApiResponseSchema>;

const result = ApiResponseSchema.safeParse(apiData);
if (result.success) {
  if (result.data.status === 'success') {
    console.log(result.data.data.id); // TypeScript 知道這裡有 data
  } else {
    console.log(result.data.message); // TypeScript 知道這裡有 message
  }
}
```

## 錯誤訊息客製化

```typescript
const schema = z.object({
  name: z.string({ required_error: '名字是必填的' })
    .min(2, { message: '名字至少 2 個字' })
    .max(50, { message: '名字不能超過 50 個字' }),
  email: z.string().email({ message: '請輸入有效的 email' }),
});
```

## 實際用途：驗證 API 回應

```typescript
// 定義 schema
const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
  body: z.string(),
  userId: z.number(),
});

const PostsSchema = z.array(PostSchema);

// fetch + 驗證
async function getPosts() {
  const res = await fetch('https://jsonplaceholder.typicode.com/posts');
  const raw = await res.json();

  const result = PostsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`API 回傳資料格式錯誤: ${result.error.message}`);
  }

  return result.data; // Post[] 型別，完全安全
}
```

## 搭配 React Hook Form

Zod 跟 [react-hook-form](https://react-hook-form.com/) 搭配是最常見的表單驗證方案：

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const LoginSchema = z.object({
  email: z.string().email('請輸入有效 email'),
  password: z.string().min(8, '密碼至少 8 個字'),
});

type LoginForm = z.infer<typeof LoginSchema>;

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  });

  return (
    <form onSubmit={handleSubmit(data => console.log(data))}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}
    </form>
  );
}
```

schema 同時負責表單驗證和型別推斷，不用重複定義。

## 小結

Zod 改變了一件事：型別定義和資料驗證從兩件事變成一件事。在 API 邊界、表單輸入、環境變數這些「資料從外部進來」的地方用它，之後的程式碼都能安全地假設資料的形狀是對的。

## 參考資源

- [Zod 官方文件](https://zod.dev/)
- [Zod GitHub 專案頁面](https://github.com/colinhacks/zod)
- [React Hook Form 官方文件](https://react-hook-form.com/)
- [@hookform/resolvers（Zod 整合套件）](https://github.com/react-hook-form/resolvers)
