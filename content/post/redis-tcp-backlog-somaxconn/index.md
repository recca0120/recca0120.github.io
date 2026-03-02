---
title: 修復 Redis TCP backlog 警告
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

## 問題

啟動 Redis 時看到這段警告：

```
The TCP backlog setting of 511 cannot be enforced because
/proc/sys/net/core/somaxconn is set to the lower value of 128
```

Redis 預設的 TCP backlog 是 511，但 Linux 核心的 `somaxconn` 只有 128，所以 Redis 沒辦法用到它想要的佇列長度。在連線量大的時候可能會掉連線。

## 解法

用 root 權限把 `somaxconn` 調大：

```bash
echo 512 > /proc/sys/net/core/somaxconn
```

這樣重開機後會失效。要永久生效的話，把設定寫進 `/etc/sysctl.conf`：

```bash
net.core.somaxconn=512
```

然後重啟或執行 `sysctl -p` 即可。
