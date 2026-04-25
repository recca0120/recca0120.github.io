---
title: 'Node.js spawn 子行程 stdout 被截斷：六個方案比過，只有寫檔有用'
description: 'Node.js spawn 大量輸出的 CLI，最後幾 KB 在 process.exit() 時消失。比較 6 種解法後，唯一可靠的純 stdlib 跨平台方案是把 stdout fd 直接接到檔案。'
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

某天我在 Node 裡 spawn 一個 CLI（剛好是 Claude CLI，會吐很多 JSON），把 stdout pipe 回來解析。短輸出沒事，但只要輸出超過幾百 KB，最後幾 KB **就是會不見**——JSON parse 在最後一行炸掉，每次的截斷位置還不太一樣。

查了一輪 Node 官方 issue、Linux pipe 文件、社群的深度分析，結論很乾脆：**這是 Node 從 2015 年就有的已知行為，純 stdlib 唯一可靠解法是寫到暫存檔**。這篇把六個方案的取捨整理清楚，省下你重複踩的時間。

## 起：問題長什麼樣

```javascript
import { spawn } from 'node:child_process';

const child = spawn('some-cli', ['--big-output']);
let buf = '';
child.stdout.on('data', (chunk) => { buf += chunk; });
child.on('close', () => {
  JSON.parse(buf); // 大輸出時這裡會炸
});
```

症狀：輸出越大越會中。MB 等級幾乎必中，幾百 KB 偶爾中。截斷點不固定——有時收到 1.2MB，有時 1.18MB。

## 承：為什麼會截

關鍵在於 Node 怎麼寫 stdio。子行程的 stdout 接到一個 pipe，**寫到 pipe 是 async 的**。子行程呼叫 `process.exit()` 時，Node 不會等所有 buffered 資料 flush 完，行程直接結束，pipe 裡還沒被父行程讀走的那段就消失了。

如果 stdout 是 TTY 或一般檔案，寫入是 sync 的，就不會這樣。問題只發生在「非 TTY、非檔案的 fd」——也就是 pipe、FIFO、socket。

這個行為從 [Node issue #3669](https://github.com/nodejs/node/issues/3669)（2015）開始追，[#6379](https://github.com/nodejs/node/issues/6379)、[#9633](https://github.com/nodejs/node/issues/9633) 又補了好幾輪討論。社群共識：**user-land 唯一可靠解是寫到檔案**，core 沒打算改。

## 轉：六個方案攤開比

| 方案 | 可行性 | 取捨 |
|------|--------|------|
| A. 寫到暫存檔 | 純 stdlib | 多一次 disk I/O，~10ms |
| B. node-pty / get-pty-output | 子行程看到 TTY | 要 native build；CLI 可能塞 ANSI 碼污染 JSON |
| C. `F_SETPIPE_SZ` 把 pipe 加大 | 只 Linux | macOS 沒這 API；只是延後截斷點 |
| D. Named pipe (FIFO) | 殊途同歸 | FIFO 跟 pipe 一樣是非檔案 fd，照截 |
| E. UNIX socket | 殊途同歸 | socket 也是非檔案 fd，async 寫照截 |
| F. 改子行程 CLI 自己 | 治本 | 通常不是你能控制的 |

### 為什麼 D / E 也不行

很多人第一直覺：「不用 pipe，改用 FIFO 或 UNIX socket 應該可以？」我也試過。結果一樣會截。

原因是「pipe 寫入 async」這個行為不是因為 pipe 這個資料結構，而是因為它是**非檔案、非 TTY 的 fd**。Linux/macOS 對這類 fd 的寫入都走 async 路徑，FIFO 跟 socket 都歸在這類，所以表現完全一樣。

### 為什麼 C 看起來像救星但其實沒用

[`fcntl(F_SETPIPE_SZ)`](https://man7.org/linux/man-pages/man7/pipe.7.html) 可以把 Linux pipe buffer 從預設 64KB 擴到 1MB（再大要 root）。聽起來很美——把 buffer 撐爆就不會截了？

三個問題：

1. **只有 Linux**。macOS 沒有 `F_SETPIPE_SZ`
2. **只是延後截斷點**。輸出 > 1MB 一樣中，沒有根治
3. **還是要 native binding**。`fcntl` 在 Node 沒包，要寫 C++ addon 或用 `ffi-napi`

跨平台想要純 stdlib，這條路直接劃掉。

### 真正能用的：spawn 時把 stdout 接到檔案

關鍵是用 `fs.openSync` 拿到一個檔案 fd，丟給 `spawn` 的 `stdio` 選項。這樣**子行程的 stdout 直接寫到檔案，不經過 pipe**，寫入是 sync 的，`process.exit()` 不會截：

```javascript
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outPath = join(tmpdir(), `cli-${process.pid}-${Date.now()}.out`);
const fd = openSync(outPath, 'w');

try {
  // stdio: [stdin, stdout, stderr]
  // 把子行程的 stdout 直接寫到檔案 fd，不經過 pipe
  spawnSync('some-cli', ['--big-output'], {
    stdio: ['ignore', fd, 'inherit'],
  });
} finally {
  closeSync(fd);
}

const output = readFileSync(outPath, 'utf8');
unlinkSync(outPath);

JSON.parse(output); // 不會炸了
```

要 async 版本就改 `spawn` + `child.on('close', ...)`，原則一樣：**fd 給檔案，不要給 pipe**。

> 注意 stderr 如果也是大量輸出，要比照辦理開第二個 fd。`'inherit'` 會直接接到父行程 stderr，沒有截斷問題但也拿不到內容。

## 合：~10ms disk I/O 的代價

這方案唯一缺點是多一次 disk I/O，實測在 SSD 上 ~10ms。對 spawn 一個會跑數秒的 CLI 來說完全不痛。如果你真的在乎這 10ms，那只剩 [node-pty](https://github.com/microsoft/node-pty) 一條路，但要面對：

- Native build（CI 多一個編譯步驟）
- 子行程看到 TTY 後可能塞 ANSI 顏色碼進 stdout，要再 strip 一遍
- macOS 跟 Windows 的後端不同（macOS 走 forkpty，Windows 走 conpty），跨平台行為差異要測

我自己的取捨：能用暫存檔就用暫存檔。10ms 換掉一個 native dependency、換掉 ANSI 污染問題，CP 值很高。

## 參考資源

- [Node.js issue #3669 — process.stdout/.stderr 在 process.exit() 可能掉資料](https://github.com/nodejs/node/issues/3669)
- [Node.js issue #6379 — stdout/stderr buffering considerations](https://github.com/nodejs/node/issues/6379)
- [Node.js issue #9633 — spawned process 結束太快導致資料遺失](https://github.com/nodejs/node/issues/9633)
- [pipe(7) — Linux manual page](https://man7.org/linux/man-pages/man7/pipe.7.html)
- [microsoft/node-pty](https://github.com/microsoft/node-pty)
- [Node.js child_process 官方文件](https://nodejs.org/api/child_process.html)
