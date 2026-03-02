---
title: 'Waiting for thread pool to idle before forking'
description: 'PHPUnit 測試時出現 gRPC 的 thread pool idle 警告，將 grpc 擴充套件降版到 1.49.0 即可解決。'
slug: waiting-for-thread-pool-to-idle-before-forking
date: '2023-01-18T15:37:51+08:00'
categories:
- PHP
tags:
- PHP
- PHPUnit
image: featured.png
draft: false
---

跑 PHPUnit 測試時不斷出現 `Waiting for thread pool to idle before forking`，這是 gRPC 擴充套件在 fork 前等待 thread pool 閒置所造成的。

## 降版 grpc 擴充套件

把 grpc 降到 1.49.0 就不會再出現這個訊息：

```bash
pecl install -o -f grpc-1.49.0
```
