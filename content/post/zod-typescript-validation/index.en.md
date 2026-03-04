---
title: 'Zod: TypeScript Schema Validation Without the Boilerplate'
date: '2026-03-11T09:00:00+08:00'
slug: zod-typescript-validation
description: 'Zod is a TypeScript-first schema validation library. Define a schema once, get runtime validation and TypeScript types automatically. Supports parse/safeParse, transform, refine, discriminated union. 2kb gzip, zero dependencies.'
categories:
  - Frontend
tags:
  - zod
  - typescript
  - validation
  - javascript
---

Do you validate the data your backend API returns?
Most people just use `as` to cast the type and hope the data matches expectations.
[Zod](https://zod.dev/) lets you define a schema once and get both runtime validation and TypeScript types — no more trust-based programming.

## Why Runtime Validation Matters

TypeScript types only exist at compile time. Once the code runs, they're gone.

```typescript
// TypeScript won't catch this
const data = await fetch('/api/user').then(r => r.json()) as User;
console.log(data.name.toUpperCase()); // If API returns null, this blows up
```

You wrote the `User` type, but nobody actually validates the API response. Zod's approach: define a schema, parse at runtime, and only get typed data after a successful parse.

## Installation

```bash
npm install zod
```

Requires TypeScript 5.5+, with `"strict": true` in your `tsconfig.json`.

## Basic Usage

```typescript
import { z } from 'zod';

// Define a schema
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Infer the type from the schema — no need to write a separate interface
type User = z.infer<typeof UserSchema>;

// Parse data
const data = UserSchema.parse({ id: 1, name: 'Alice', email: 'alice@example.com' });
// data is typed as User, fully type-safe
```

`z.infer<typeof UserSchema>` is the key. Write the schema once, and the type is inferred automatically. Change the schema and the type updates too — no need to maintain both separately.

## parse vs safeParse

`parse` throws on failure, `safeParse` returns a result object:

```typescript
// parse: throws ZodError on failure
try {
  const user = UserSchema.parse(untrustedData);
} catch (e) {
  if (e instanceof z.ZodError) {
    console.log(e.issues); // Detailed error info
  }
}

// safeParse: no exceptions, check result.success
const result = UserSchema.safeParse(untrustedData);
if (!result.success) {
  console.log(result.error.issues);
} else {
  const user = result.data; // typed as User
}
```

Use `safeParse` in API handlers — you don't want a validation failure to crash the entire request.

## String Validation

```typescript
const schema = z.object({
  email: z.string().email(),
  url: z.string().url(),
  uuid: z.string().uuid(),
  username: z.string().min(3).max(20),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  bio: z.string().trim().max(200),   // trim first, then validate length
});
```

Common formats are built in: `email()`, `url()`, `uuid()`, `ip()`, `datetime()` — no need to write your own regex.

## Number Validation

```typescript
const schema = z.object({
  age: z.number().int().min(0).max(120),
  price: z.number().positive(),
  rating: z.number().min(1).max(5).multipleOf(0.5),
});
```

## Object Methods

This is where Zod shines — defining the shape of API request/response bodies:

```typescript
const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  age: z.number().optional(),          // can be omitted
  bio: z.string().nullable(),          // can be null
});

// Derive UpdateUser from CreateUser (all fields become optional)
const UpdateUserSchema = CreateUserSchema.partial();

// Pick specific fields
const LoginSchema = CreateUserSchema.pick({ email: true, name: false });

// Exclude fields
const PublicUserSchema = CreateUserSchema.omit({ role: true });

// Add fields
const UserWithIdSchema = CreateUserSchema.extend({
  id: z.number(),
  createdAt: z.date(),
});
```

## Arrays and Tuples

```typescript
// String array with at least one element
const TagsSchema = z.array(z.string()).min(1).max(10);

// Tuple: fixed length, different type at each position
const CoordinateSchema = z.tuple([z.number(), z.number()]);
// equivalent to [longitude, latitude]
```

## Defaults and Transforms

```typescript
const ConfigSchema = z.object({
  timeout: z.number().default(5000),       // 5000 if not provided
  retries: z.number().default(3),
  baseUrl: z.string().default('https://api.example.com'),
});

// transform: convert the value after parsing
const DateSchema = z.string().transform(str => new Date(str));
// input: string, output: Date

// coerce: automatic type coercion (great for form data)
const AgeSchema = z.coerce.number().min(0);
// input: "25" (string), output: 25 (number)
```

## Custom Validation: refine

```typescript
// Simple custom validation
const PasswordSchema = z.object({
  password: z.string().min(8),
  confirm: z.string(),
}).refine(
  data => data.password === data.confirm,
  {
    message: 'Passwords do not match',
    path: ['confirm'],    // attach the error to this field
  }
);

// superRefine: add multiple errors
const PriceSchema = z.object({
  min: z.number(),
  max: z.number(),
}).superRefine((data, ctx) => {
  if (data.min >= data.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'min must be less than max',
      path: ['min'],
    });
  }
});
```

## Discriminated Union

When an API returns data with different shapes, discriminated union is more efficient:

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
    console.log(result.data.data.id); // TypeScript knows data exists here
  } else {
    console.log(result.data.message); // TypeScript knows message exists here
  }
}
```

## Custom Error Messages

```typescript
const schema = z.object({
  name: z.string({ required_error: 'Name is required' })
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(50, { message: 'Name cannot exceed 50 characters' }),
  email: z.string().email({ message: 'Please enter a valid email' }),
});
```

## Real-World Example: Validating API Responses

```typescript
// Define the schema
const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
  body: z.string(),
  userId: z.number(),
});

const PostsSchema = z.array(PostSchema);

// fetch + validate
async function getPosts() {
  const res = await fetch('https://jsonplaceholder.typicode.com/posts');
  const raw = await res.json();

  const result = PostsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`API response format error: ${result.error.message}`);
  }

  return result.data; // typed as Post[], fully safe
}
```

## With React Hook Form

Zod + [react-hook-form](https://react-hook-form.com/) is the most common form validation setup:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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

One schema handles both form validation and type inference.

## Summary

Zod changes one thing: type definitions and data validation go from being two separate tasks to one. Use it at API boundaries, form inputs, and environment variables — anywhere data comes in from outside. After that, the rest of your code can safely assume the data has the right shape.
