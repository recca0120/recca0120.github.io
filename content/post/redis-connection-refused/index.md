---
title: Redis Connection Refused
slug: redis-connection-refused
date: '2020-07-21T14:40:39+08:00'
categories:
- Database
tags:
- Redis
draft: false
image: featured.png
---

## 問題

把 Redis 升級到 6.0.5 之後，用 `redis-cli` 連線時冒出了這段錯誤：

```
Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

Redis 6.0 開始預設綁定了特定的網路介面，加上 `protected-mode` 預設為 `yes`，導致本機連線也會被擋下來。

## 解法

修改 `redis.conf`，調整兩個設定：

```ini
# 把 bind 那行註解掉，讓 Redis 監聽所有介面
# bind 192.168.0.5

# 關閉 protected mode
protected-mode no
```

改完之後重啟 Redis 就能正常連線了。

## 補充

如果只是開發環境這樣改沒問題。正式環境建議保留 `protected-mode yes`，改用密碼驗證或防火牆規則來控制存取。
