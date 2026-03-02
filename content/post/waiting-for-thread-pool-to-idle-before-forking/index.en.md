---
title: 'Waiting for thread pool to idle before forking'
description: 'Fix the gRPC thread pool idle warning in PHPUnit tests by downgrading the grpc extension to version 1.49.0.'
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

When running PHPUnit tests, the message `Waiting for thread pool to idle before forking` keeps appearing. This is caused by the gRPC extension waiting for the thread pool to become idle before forking.

## Downgrade the grpc Extension

Downgrading grpc to 1.49.0 eliminates this message:

```bash
pecl install -o -f grpc-1.49.0
```
