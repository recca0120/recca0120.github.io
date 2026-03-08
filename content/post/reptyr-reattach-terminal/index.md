---
title: 'reptyr：SSH 忘開 tmux 也救得回來，把 process 移進去'
date: '2026-03-25T09:00:00+08:00'
slug: reptyr-reattach-terminal
description: 'reptyr 用 ptrace 把已在執行的 process 重新附加到新的 terminal。SSH 忘開 tmux 就跑了長時間任務，或者想把 background process 移進 screen，reptyr 一個指令搞定。'
categories:
  - Tools
tags:
  - reptyr
  - linux
  - terminal
  - tmux
  - ssh
  - process
  - rescue
---

SSH 進去跑了一個要跑幾小時的任務，沒開 tmux。
現在要離開，直接關視窗 process 就死了，`nohup` 也沒加。
`reptyr` 可以把這個 process 移進 tmux，讓你安心斷線。

## reptyr 是什麼

[reptyr](https://github.com/nelhage/reptyr) 用 `ptrace` 系統呼叫把一個已在執行的 process 重新附加到新的 terminal。它真正改變的是 process 的 **controlling terminal**，不只是重導 I/O。

這個差別很重要。以前用 gdb 的 `screenify` 腳本也能做類似的事，但有三個問題：

- 舊 terminal 的輸入還是會被 process 接收
- 視窗大小改變（resize）沒辦法通知 ncurses 程式
- 新 terminal 的 `Ctrl-C` 無法生效

reptyr 因為真正換掉 controlling terminal，這三個問題都沒有。

## 安裝

```bash
# Ubuntu / Debian
sudo apt install reptyr

# Arch
sudo pacman -S reptyr

# macOS（透過 Homebrew，Linux 模擬）
brew install reptyr

# 從原始碼編譯
git clone https://github.com/nelhage/reptyr
cd reptyr && make && sudo make install
```

## 基本用法

```bash
reptyr <PID>
```

執行後，PID 對應的 process 就會附加到目前的 terminal，接收這個 terminal 的輸入輸出和訊號（`Ctrl-C`、`Ctrl-Z` 都有效）。

## 實際情境：SSH 忘開 tmux

這是最常用的場景。

```bash
# 1. 先確認 process 的 PID
jobs -l
# 或
ps aux | grep my-script

# 2. 如果 process 是 foreground，先暫停它
Ctrl-Z

# 3. 移到 background
bg

# 4. 讓它脫離目前 shell 的管控（不然 shell 結束時它還是會死）
disown

# 5. 開 tmux
tmux new -s rescue

# 6. 在 tmux 裡用 reptyr 把它拉進來
reptyr <PID>

# 7. 現在可以安全斷線了
Ctrl-B D  # detach tmux
```

重新連線時：

```bash
ssh yourserver
tmux attach -t rescue
```

process 還在跑，輸出也在。

## ptrace_scope 的限制（Ubuntu）

Ubuntu 10.10 以後預設禁止非 root 用 ptrace attach 到其他 process，reptyr 執行時會看到：

```
Unable to attach to pid 12345: Operation not permitted
```

臨時解除限制：

```bash
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

永久設定：

```bash
# 編輯 /etc/sysctl.d/10-ptrace.conf
kernel.yama.ptrace_scope = 0
```

或者用 `sudo reptyr <PID>` 直接以 root 執行。

> `ptrace_scope` 的值：0 = 允許、1 = 僅限父 process（預設）、2 = 僅限 root、3 = 完全禁止。降到 1 就夠用了，不一定要到 0。

## 進階：reptyr -l

```bash
reptyr -l
# 輸出：/dev/pts/7
```

建立一個獨立的 pseudo-terminal pair，不跟任何 shell 連結。主要用途是 gdb 偵錯時把 inferior 的 I/O 導到這個 pty：

```gdb
(gdb) set inferior-pty /dev/pts/7
```

比直接把 gdb 的 terminal 讓出去乾淨很多。

## 不適用的情況

- **daemon process**：已經完全脫離 terminal 的 process（沒有 controlling terminal）無法附加
- **setuid binary**：ptrace 無法 attach 到 setuid 程式（安全限制）
- **已死的 process**：當然救不回來

## 小結

忘開 tmux 不是世界末日。`reptyr <PID>` 一行，process 就從快死的 SSH session 搬進 tmux，繼續跑完。記得先 `disown` 讓它脫離 shell，再開 tmux 把它拉進去。Ubuntu 的話順便把 `ptrace_scope` 調整一下。
