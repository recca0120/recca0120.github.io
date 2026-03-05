---
title: "PHP goto Isn't Evil: One Less Nesting Level for Retry Logic"
date: '2026-03-18T09:00:00+08:00'
slug: php-goto-retry
description: 'PHP goto makes retry logic more readable than while loops: one less nesting level, flatter structure, clearer intent. Only jumps back when explicitly retrying — success returns directly, exhausted retries throw.'
categories:
  - Backend
tags:
  - php
  - goto
  - retry
  - pattern
---

The first instinct for retry logic is usually `while (true)`. It works, but the try/catch ends up nested inside the loop, adding an extra indent level and burying the intent slightly.
PHP has `goto`, and most people skip right past it. But for retry logic specifically, it's one level flatter and the intent is clearer.

## The while Version

The common approach:

```php
while (true) {              // first level: the loop
    try {                   // second level: try
        $client = new Client();
        $response = $client->request($method, $uri, array_filter([
            'form_params' => $form_params,
            'multipart'   => $multipart,
        ]));

        return json_decode($response->getBody(), associative: true);

    } catch (ConnectException $e) {
        $times--;
        if (! $times) {
            throw $e;       // only throw when retries are exhausted
        }
        usleep(3000);
        // continue to next while iteration
    }
}
```

It works fine. But a few things are slightly awkward:

1. `while (true)` exists purely to "jump back" — it carries no business meaning
2. The entire try/catch is pushed one level right
3. The success path exits via `return` from inside a loop — it's a side exit, not a natural one

## The goto Version

```php
beginning:                  // label — the jump target
try {                       // top level, one less indent
    $client = new Client();
    $response = $client->request($method, $uri, array_filter([
        'form_params' => $form_params,
        'multipart'   => $multipart,
    ]));

    return json_decode($response->getBody(), associative: true);

} catch (ConnectException $e) {
    $times--;
    if (! $times) {
        throw $e;           // retries exhausted — throw
    }
    usleep(microseconds: 3000);
    goto beginning;         // explicitly says "retry" — jump back to label
}
```

The flow is direct:

- Success → `return`
- Failure with retries remaining → `goto beginning`
- Failure with no retries left → `throw`

The jump only happens when explicitly retrying. There's no implicit "loop continues" logic to reason about.

## The Structural Difference

```
while version:
└── while(true)        ← first level
    └── try { ... }    ← second level
        └── catch

goto version:
└── try { ... }        ← first level (top)
    └── catch
        └── goto beginning
```

That saved level becomes very noticeable when the try block is long.

## PHP goto Constraints

PHP's `goto` has a few rules:

```php
// ✓ Can jump to a label in the same function
function doRequest() {
    retry:
    try { ... }
    catch (...) { goto retry; }
}

// ✗ Cannot jump into a loop or switch body
for (...) {
    inside:   // cannot goto here from outside the loop
}

// ✗ Cannot jump across functions
function a() { goto label; }
function b() { label: ... }  // not allowed
```

As long as the target label is in the same function and not inside a loop or switch body, it's valid.

## Why goto Has a Bad Reputation

Historical reasons. In the C era, `goto` was heavily abused to produce spaghetti code with jumps flying everywhere. Dijkstra's 1968 letter "Go To Statement Considered Harmful" cemented `goto`'s association with bad code, and the reputation stuck.

But that critique was aimed at **arbitrary jumping**, not every use of `goto`. Jumping backward for retry logic — with a clear, local target and obvious intent — is nothing like the kind of `goto` that caused problems.

In practice, the Linux kernel still uses `goto` for cleanup paths in C. You can find occasional `goto` in Symfony and other major PHP codebases too.

## When This Pattern Fits

The `goto` retry pattern works well when:

- There's a fixed retry count
- Only specific exceptions trigger a retry (here: `ConnectException`)
- There's a delay between retries (`usleep`)
- The logic is simple and the jump target is obvious

If the retry logic becomes more complex — exponential backoff, multiple exception types, logging — wrap it in a helper function instead of stretching `goto` further.

## Summary

`goto` isn't untouchable — it just needs the right context. For retry logic with a clear backward jump, no cross-function leaps, and an obvious target, `goto` expresses the intent more directly than `while (true)` and saves a level of nesting.

When you see `goto`, don't flinch. Look at where it jumps and why, then decide if it needs changing.
