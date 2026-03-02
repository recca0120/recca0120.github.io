---
title: Redis The TCP backlog setting of 511 cannot be enforced because /proc/sys/net/core/somaxconn
  is set to the lower value of 128
slug: redis-the-tcp-backlog-setting-of-511-cannot-be-enforced-because-/proc/sys/net/core/somaxconn-is-set-to-the-lower-value-of-128
date: '2020-06-12T14:01:07+08:00'
categories:
- redis
tags:
- redis
draft: false
---
看到 `The TCP backlog setting of 511 cannot be enforced because /proc/sys/net/core/somaxconn is set to the lower value of 128` 這個訊息的修復方式

- `echo 512 > /proc/sys/net/core/somaxconn` with root
- add `net.core.somaxconn=512` in the `/etc/sysctl.conf` file and restart