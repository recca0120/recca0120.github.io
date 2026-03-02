---
title: 'macOS PHP 執行 HTTP 請求噴出 NSCFConstantString 錯誤的解法'
description: 'macOS artisan tinker 用 Guzzle 噴 NSCFConstantString 錯誤，設環境變數關閉 fork safety 即可解決。'
slug: php-objc86150-nscfconstantstring-initialize-may-have-been-in-progress-in-another-thread
date: '2022-12-26T08:41:00+08:00'
categories:
  - macOS
  - PHP
tags:
  - PHP
  - Guzzle
image: featured.png
draft: false
---

在 `artisan tinker` 裡用 Guzzle Client 抓資料時，macOS 會噴出 `objc[86150]: +[__NSCFConstantString initialize] may have been in progress in another thread when fork() was called`。這是 macOS 的 Objective-C runtime 在 fork 時的安全檢查機制造成的。

## 關閉 fork 安全檢查

設定環境變數讓 macOS 跳過這個檢查：

```bash
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
```

加到 `~/.bashrc` 或 `~/.zshrc` 就不用每次手動設定了。
