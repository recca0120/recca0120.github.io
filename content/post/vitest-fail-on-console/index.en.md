---
title: 'vitest-fail-on-console: Stop Ignoring console.error in Your Tests'
description: 'Introducing vitest-fail-on-console — why console.warn/error appearing silently in tests is a code smell, and how this package forces you to deal with it.'
slug: vitest-fail-on-console
date: '2026-05-02T08:18:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Testing
- Vitest
- Node.js
draft: false
---

All tests pass, but the terminal is full of red `console.error` output. This is common and easy to ignore — the tests passed, after all. But those errors don't appear out of nowhere. Something went wrong; nobody just noticed.

[vitest-fail-on-console](https://github.com/thomasbrodusch/vitest-fail-on-console) does one thing: if `console.error` or `console.warn` appears during a test, that test fails. It forces you to acknowledge these messages instead of letting them drown in noise.

## Why console.error in Tests Is a Code Smell

Vitest doesn't care about console output by default. You can `console.error` all day and tests still pass.

The problem is that `console.error` usually means something. It might be:

- A React prop type warning
- An async error that was caught but not properly handled
- A third-party package telling you you're using it wrong
- An error handler in your own code getting triggered

When these appear in tests, the test is running in a slightly broken state — it just didn't throw. Over time the test output becomes pure noise. Nobody reads it anymore, and the real signals get buried.

`vitest-fail-on-console` flips this: make console output a test failure, so you're forced to address it.

## Installation

```bash
npm install -D vitest-fail-on-console
```

## Setup

Import and call it in your setup file:

```typescript
// tests/setup.ts
import failOnConsole from 'vitest-fail-on-console'

failOnConsole()
```

Then wire up the setup file in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
  },
})
```

That's it. Any test that triggers `console.error` or `console.warn` will now fail.

## Options

`failOnConsole()` accepts an options object to control which console methods trigger failures:

```typescript
failOnConsole({
  shouldFailOnError: true,   // default true
  shouldFailOnWarn: true,    // default true
  shouldFailOnLog: false,    // default false
  shouldFailOnInfo: false,   // default false
  shouldFailOnDebug: false,  // default false
  shouldFailOnAssert: false, // default false
})
```

`error` and `warn` are usually enough. Whether to include `log` / `info` / `debug` depends on your project's conventions.

### allowMessage

Allow specific messages through without failing — useful for known third-party issues you can't fix right now:

```typescript
failOnConsole({
  allowMessage: (message) => {
    return /ResizeObserver loop limit exceeded/.test(message)
  },
})
```

### silenceMessage

Like `allowMessage`, but also suppresses the console output entirely:

```typescript
failOnConsole({
  silenceMessage: (message) => {
    return /Not implemented: navigation/.test(message)
  },
})
```

### skipTest

Skip specific test files or test names entirely:

```typescript
failOnConsole({
  skipTest: ({ testPath, testName }) => {
    return testPath.includes('/legacy/')
  },
})
```

### afterEachDelay

Sometimes async operations call console methods after a test ends. This option adds a delay before checking:

```typescript
failOnConsole({
  afterEachDelay: 100, // wait 100ms, default is 0
})
```

## Handling Expected console.error Calls

After installing `vitest-fail-on-console`, if a test is specifically verifying that `console.error` gets called, letting it fire naturally will cause the test to fail.

The correct approach is to mock it with `vi.spyOn`:

```typescript
it('logs an error when request fails', () => {
  // mock it so the message doesn't actually reach the console
  vi.spyOn(console, 'error').mockImplementation(() => {})

  triggerSomethingThatLogsError()

  // assert it was called with the expected message
  expect(console.error).toHaveBeenCalledWith('Request failed')
})
```

This does two things: the test explicitly declares "I know an error will be logged here," and it asserts the exact message. Much stricter than silently letting `console.error` through.

## Pair It with a Clean Test Environment

`vitest-fail-on-console` handles the console output side. If your tests also have I/O boundaries to replace — filesystem, file watchers — you can pair it with memfs using the same philosophy: every aspect of the test environment should be under your control.

See [Testing a Filesystem Service with memfs + FakeWatchService]({{< ref "/post/memfs-fake-watch-testing" >}}) for that approach.

## References

- [vitest-fail-on-console — GitHub](https://github.com/thomasbrodusch/vitest-fail-on-console)
- [vitest-fail-on-console — npm](https://www.npmjs.com/package/vitest-fail-on-console)
- [Vitest — setupFiles configuration](https://vitest.dev/config/#setupfiles)
