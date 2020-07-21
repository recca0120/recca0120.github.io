title: Redis Connection Refused
urlname: redis-connection-refused
comments: true
categories:
  - redis
author: recca0120
abbrlink: 5180
tags: redis
date: 2020-07-21 14:40:39
updated: 2020-07-21 14:40:39
keywords:
description:
---
將 Redis 升級到 6.0.5 後，執行 redis-cli 後會提示 `Could not connect to Redis at 127.0.0.1:6379: Connection refused`，這時只要修改 `redis.conf` 將 bind 刪除及將 protected-mode 設為 no 即可 


```ini
# 將 bind 刪除或標註
# bind 192.168.0.5

# 將 protected-mode yes 改為 no
protected-mode no

```