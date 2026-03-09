---
title: 'Fix Redis TCP Backlog 511 Warning: Raise somaxconn'
description: 'Redis warns that TCP backlog 511 exceeds somaxconn 128, dropping connections under load. Raise somaxconn via /proc and persist it in sysctl.conf permanently.'
slug: redis-the-tcp-backlog-setting-of-511-cannot-be-enforced-because-/proc/sys/net/core/somaxconn-is-set-to-the-lower-value-of-128
date: '2020-06-12T14:01:07+08:00'
categories:
  - Database
  - DevOps
tags:
  - Redis
  - Linux
draft: false
image: featured.jpg
---

## Problem

When starting Redis, this warning appears:

```
The TCP backlog setting of 511 cannot be enforced because
/proc/sys/net/core/somaxconn is set to the lower value of 128
```

Redis defaults to a TCP backlog of 511, but the Linux kernel's `somaxconn` is only 128, so Redis can't use the queue length it wants. Under heavy connection load, this can cause dropped connections.

![TCP backlog limited by somaxconn](tcp-backlog-somaxconn.png)

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

## References

- [Redis documentation: kernel tuning recommendations](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/)
- [Linux kernel docs: net.core.somaxconn](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)
- [sysctl configuration guide (Arch Wiki)](https://wiki.archlinux.org/title/sysctl)
