---
title: Fix Redis Connection Refused After Upgrading to 6.0
description: 'Redis 6.0 changed the defaults for bind and protected-mode, causing Connection refused errors. Adjust two settings in redis.conf to restore connectivity.'
slug: redis-connection-refused
date: '2020-07-21T14:40:39+08:00'
categories:
  - Database
  - DevOps
tags:
  - Redis
draft: false
image: featured.jpg
---

## Problem

After upgrading Redis to 6.0.5, connecting with `redis-cli` threw this error:

```
Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

Starting from Redis 6.0, the default configuration binds to specific network interfaces, and `protected-mode` defaults to `yes`, which blocks even localhost connections.

## Solution

Edit `redis.conf` and adjust two settings:

```ini
# Comment out the bind line to make Redis listen on all interfaces
# bind 192.168.0.5

# Disable protected mode
protected-mode no
```

Restart Redis after making the changes and connections should work again.

## Note

This is fine for development environments. For production, keep `protected-mode yes` and use password authentication or firewall rules to control access instead.

## References

- [Redis 6.0 Release Notes — security changes](https://raw.githubusercontent.com/redis/redis/6.0/00-RELEASENOTES)
- [Redis configuration documentation: bind and protected-mode](https://redis.io/docs/latest/operate/oss_and_stack/management/config/)
- [Redis security best practices](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)
