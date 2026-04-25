---
title: 'Node.js spawn stdout Gets Truncated: Compared 6 Fixes, Only the File Trick Works'
description: 'When spawning a high-output CLI in Node.js, the last few KB vanish on process.exit(). After comparing 6 solutions, the only reliable cross-platform stdlib fix is piping the child stdout fd to a file.'
slug: nodejs-spawn-stdout-truncated
date: '2026-04-26T04:55:00+08:00'
image: featured.png
categories:
- DevOps
tags:
- Node.js
- stdio
- spawn
draft: false
---

One day I was spawning a CLI from Node (the Claude CLI, which dumps a lot of JSON) and piping its stdout back to parse. Short outputs were fine. But the moment output grew past a few hundred KB, the last few KB **just disappeared** — JSON.parse blew up on the final line, and the truncation point shifted run to run.

After digging through Node's official issues, Linux pipe docs, and community deep-dives, the verdict is blunt: **this is a known Node behavior since 2015, and the only reliable pure-stdlib fix is writing to a temp file.** This post lays out the trade-offs across six approaches so you don't have to repeat the journey.

## The Symptom

```javascript
import { spawn } from 'node:child_process';

const child = spawn('some-cli', ['--big-output']);
let buf = '';
child.stdout.on('data', (chunk) => { buf += chunk; });
child.on('close', () => {
  JSON.parse(buf); // blows up on large outputs
});
```

The bigger the output, the higher the chance. MB-scale almost always truncates; hundreds of KB occasionally. The cut-off point isn't fixed — sometimes you get 1.2 MB, sometimes 1.18 MB.

## Why It Truncates

The root cause is how Node writes stdio. The child's stdout connects to a pipe, and **writes to a pipe are async**. When the child calls `process.exit()`, Node doesn't wait for buffered data to flush — the process exits immediately, and whatever sat in the pipe unread gets lost.

If stdout is a TTY or a regular file, writes are sync and this never happens. The bug only triggers on "non-TTY, non-file fds" — pipes, FIFOs, and sockets.

This was first tracked in [Node issue #3669](https://github.com/nodejs/node/issues/3669) (2015), then revisited in [#6379](https://github.com/nodejs/node/issues/6379) and [#9633](https://github.com/nodejs/node/issues/9633). The community consensus: **user-land's only reliable workaround is writing to a file.** Core has no plans to change it.

## Six Approaches Side by Side

| Approach | Viability | Trade-off |
|----------|-----------|-----------|
| A. Temp file | Pure stdlib | One extra disk I/O, ~10ms |
| B. node-pty / get-pty-output | Child sees a TTY | Needs native build; CLI may inject ANSI codes that pollute JSON |
| C. `F_SETPIPE_SZ` to enlarge pipe | Linux only | macOS lacks the API; only delays the cut-off point |
| D. Named pipe (FIFO) | Same dead end | FIFOs are non-file fds too — same truncation |
| E. UNIX socket | Same dead end | Sockets are also non-file fds, async writes still truncate |
| F. Fix the child CLI itself | Root cause | Usually not under your control |

### Why D / E Don't Work Either

A common first thought: "Skip the pipe, use a FIFO or UNIX socket — that should work, right?" I tried it. Same truncation.

The reason: "async pipe writes" isn't a property of pipes specifically — it's a property of **non-file, non-TTY fds**. Linux and macOS route writes to such fds through the async path, and FIFOs and sockets fall in the same bucket. Identical behavior.

### Why C Looks Promising but Isn't

[`fcntl(F_SETPIPE_SZ)`](https://man7.org/linux/man-pages/man7/pipe.7.html) can grow the Linux pipe buffer from 64 KB default to 1 MB (more than that needs root). Sounds great — fill the buffer big enough and nothing gets cut, right?

Three problems:

1. **Linux only.** macOS doesn't have `F_SETPIPE_SZ`
2. **Only delays the cut-off.** Outputs > 1 MB still truncate — no real fix
3. **Still needs a native binding.** `fcntl` isn't exposed in Node — you'd write a C++ addon or use `ffi-napi`

If you want pure stdlib and cross-platform, this path is out.

### What Actually Works: Pipe stdout to a File

The trick is to use `fs.openSync` to grab a file fd and hand it to `spawn`'s `stdio` option. This way **the child writes stdout directly to the file, bypassing any pipe** — writes are sync, `process.exit()` won't truncate:

```javascript
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outPath = join(tmpdir(), `cli-${process.pid}-${Date.now()}.out`);
const fd = openSync(outPath, 'w');

try {
  // stdio: [stdin, stdout, stderr]
  // Send child stdout straight to a file fd, no pipe in between
  spawnSync('some-cli', ['--big-output'], {
    stdio: ['ignore', fd, 'inherit'],
  });
} finally {
  closeSync(fd);
}

const output = readFileSync(outPath, 'utf8');
unlinkSync(outPath);

JSON.parse(output); // no longer blows up
```

For an async version, use `spawn` + `child.on('close', ...)`. Same principle: **fd to a file, never a pipe.**

> If stderr is also high-volume, do the same with a second fd. `'inherit'` forwards to the parent's stderr cleanly but you can't capture it.

## The ~10ms Disk I/O Cost

The only downside is the extra disk I/O — about 10ms on SSD. For a CLI that runs for several seconds, this is noise. If you genuinely care about that 10ms, the only remaining path is [node-pty](https://github.com/microsoft/node-pty), but you'll deal with:

- Native build (extra compile step in CI)
- Child sees a TTY and may inject ANSI color codes into stdout — strip them
- macOS and Windows backends differ (forkpty vs conpty), test both

My take: if a temp file works, use a temp file. Trading 10ms to avoid a native dependency and ANSI pollution is an easy win.

## References

- [Node.js issue #3669 — process.stdout/.stderr may lose data on process.exit()](https://github.com/nodejs/node/issues/3669)
- [Node.js issue #6379 — stdout/stderr buffering considerations](https://github.com/nodejs/node/issues/6379)
- [Node.js issue #9633 — Output data lost from spawned process if process ends before all data read](https://github.com/nodejs/node/issues/9633)
- [pipe(7) — Linux manual page](https://man7.org/linux/man-pages/man7/pipe.7.html)
- [microsoft/node-pty](https://github.com/microsoft/node-pty)
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html)
