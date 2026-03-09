---
title: 'reptyr: Move a Running Process Into tmux After Forgetting to Start It'
date: '2026-03-25T09:00:00+08:00'
slug: reptyr-reattach-terminal
image: featured.jpg
description: 'reptyr uses ptrace to re-attach a running process to a new terminal. Started a long job over SSH without tmux? reptyr moves the process into tmux so you can disconnect safely.'
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

You SSH'd in and started a job that will run for hours. No tmux. No nohup.
Now you need to leave, and closing the window kills the process.
`reptyr` moves it into tmux so you can disconnect safely.

## What reptyr Does

[reptyr](https://github.com/nelhage/reptyr) uses the `ptrace` syscall to re-attach a running process to a new terminal. It genuinely changes the process's **controlling terminal** — not just redirecting I/O.

That distinction matters. Old `gdb`-based scripts like "screenify" can do something similar, but with three problems:

- The old terminal still delivers input to the process
- Window resize events don't reach ncurses applications
- `Ctrl-C` from the new terminal doesn't work

reptyr fixes all three because it actually replaces the controlling terminal.

## Installation

```bash
# Ubuntu / Debian
sudo apt install reptyr

# Arch
sudo pacman -S reptyr

# From source
git clone https://github.com/nelhage/reptyr
cd reptyr && make && sudo make install
```

## Basic Usage

```bash
reptyr <PID>
```

The process attaches to the current terminal and receives its input, output, and signals (`Ctrl-C`, `Ctrl-Z` all work).

## The Common Scenario: Forgot to Start tmux

```bash
# 1. Find the process PID
jobs -l
# or
ps aux | grep my-script

# 2. If it's in the foreground, suspend it
Ctrl-Z

# 3. Move it to the background
bg

# 4. Detach it from the current shell (so the shell dying won't kill it)
disown

# 5. Start tmux
tmux new -s rescue

# 6. Pull the process into tmux
reptyr <PID>

# 7. Safe to disconnect now
Ctrl-B D  # detach tmux
```

When you reconnect:

```bash
ssh yourserver
tmux attach -t rescue
```

The process is still running, output intact.

## The ptrace_scope Problem (Ubuntu)

Ubuntu 10.10+ disables non-root ptrace by default. reptyr will fail with:

```
Unable to attach to pid 12345: Operation not permitted
```

Temporarily allow it:

```bash
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

Permanently:

```bash
# Edit /etc/sysctl.d/10-ptrace.conf
kernel.yama.ptrace_scope = 0
```

Or just run `sudo reptyr <PID>`.

> `ptrace_scope` values: 0 = allow all, 1 = parent-only (default), 2 = root only, 3 = disabled. Setting it to 1 is enough for reptyr to work if you own the process.

## Advanced: reptyr -l

```bash
reptyr -l
# Outputs: /dev/pts/7
```

Creates a detached pseudo-terminal pair not connected to any shell. Useful for gdb:

```gdb
(gdb) set inferior-pty /dev/pts/7
```

Cleaner than handing gdb your terminal directly.

## When It Won't Work

- **Daemon processes**: already detached from any terminal — nothing to re-attach to
- **setuid binaries**: ptrace can't attach (security restriction)
- **Dead processes**: obviously not salvageable

## Summary

Forgetting tmux isn't fatal. `reptyr <PID>` moves a process from a dying SSH session into tmux in one command. `disown` it first to cut the shell's hold, then open tmux and pull it in. On Ubuntu, adjust `ptrace_scope` as needed.

## References

- [reptyr GitHub repository](https://github.com/nelhage/reptyr)
- [tmux official GitHub repository](https://github.com/tmux/tmux)
- [Linux Yama ptrace_scope security documentation](https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html)
- [tmux manual page](https://man.openbsd.org/tmux.1)
