---
title: '修復 DBngin 找不到 mysql 指令的問題'
description: 'DBngin 支援多版本 MySQL 但不會自動加 PATH，一行指令把最新版路徑寫進 .bashrc，終端機就能直接使用 mysql 指令。'
slug: dbngin-mysql-command
date: '2022-11-08T03:16:32+08:00'
categories:
- Database
- macOS
tags:
- MySQL
- macOS
image: featured.jpg
draft: false
---

[DBngin](https://dbngin.com/) 可以同時跑多個版本的 MySQL、PostgreSQL 及 Redis，但因為支援多版本，它不會自動把 mysql 執行檔加進 PATH，所以在終端機直接打 `mysql` 會找不到指令。

## 把最新版 MySQL 加入 PATH

在 `~/.bashrc` 加入以下設定，自動抓最新版本的 MySQL 路徑：

```bash
echo 'export PATH=`printf "%s"$'\''\n'\'' /Users/Shared/DBngin/mysql/* | sort -Vr | head -n1`/bin:$PATH' >> ~/.bashrc
```

重新開啟終端機後就能直接使用 `mysql` 指令了。
