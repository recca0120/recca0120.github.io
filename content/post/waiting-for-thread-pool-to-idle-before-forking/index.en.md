---
title: 'Fix gRPC "Waiting for thread pool to idle" in PHPUnit'
description: 'PHPUnit prints "Waiting for thread pool to idle before forking" when the gRPC extension is too new. Downgrade grpc to 1.49.0 to eliminate the warning.'
slug: waiting-for-thread-pool-to-idle-before-forking
date: '2023-01-18T15:37:51+08:00'
categories:
  - PHP
  - Testing
tags:
  - PHP
  - PHPUnit
image: featured.jpg
draft: false
---

When running PHPUnit tests, the message `Waiting for thread pool to idle before forking` keeps appearing. This is caused by the gRPC extension waiting for the thread pool to become idle before forking.

## Downgrade the grpc Extension

Downgrading grpc to 1.49.0 eliminates this message:

```bash
pecl install -o -f grpc-1.49.0
```
