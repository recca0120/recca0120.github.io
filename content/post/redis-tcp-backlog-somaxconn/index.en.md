---
title: Fix Redis TCP Backlog Warning
slug: redis-the-tcp-backlog-setting-of-511-cannot-be-enforced-because-/proc/sys/net/core/somaxconn-is-set-to-the-lower-value-of-128
date: '2020-06-12T14:01:07+08:00'
categories:
- Database
tags:
- Redis
- Linux
draft: false
image: featured.png
---

## Problem

When starting Redis, this warning appears:

```
The TCP backlog setting of 511 cannot be enforced because
/proc/sys/net/core/somaxconn is set to the lower value of 128
```

Redis defaults to a TCP backlog of 511, but the Linux kernel's `somaxconn` is only 128, so Redis can't use the queue length it wants. Under heavy connection load, this can cause dropped connections.

## Solution

Increase `somaxconn` with root privileges:

```bash
echo 512 > /proc/sys/net/core/somaxconn
```

This won't persist after a reboot. To make it permanent, add the setting to `/etc/sysctl.conf`:

```bash
net.core.somaxconn=512
```

Then reboot or run `sysctl -p` to apply.
