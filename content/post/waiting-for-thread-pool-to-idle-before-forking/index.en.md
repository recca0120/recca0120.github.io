---
title: 'Fix the gRPC "Waiting for thread pool to idle" Warning in PHPUnit'
description: 'PHPUnit keeps printing "Waiting for thread pool to idle before forking" because the gRPC extension version is too high. Downgrade the grpc extension to 1.49.0 to eliminate the warning entirely.'
slug: waiting-for-thread-pool-to-idle-before-forking
date: '2023-01-18T15:37:51+08:00'
categories:
  - PHP
  - Testing
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
