---
title: 'Fix the Missing mysql Command in DBngin'
description: 'DBngin supports multiple MySQL versions but never adds them to PATH. One line in .bashrc pointing to the latest version gets the mysql command working in the terminal.'
slug: dbngin-mysql-command
date: '2022-11-08T03:16:32+08:00'
categories:
- Database
- macOS
tags:
- MySQL
- macOS
image: featured.png
draft: false
---

[DBngin](https://dbngin.com/) lets you run multiple versions of MySQL, PostgreSQL, and Redis simultaneously. However, since it supports multiple versions, it doesn't automatically add the mysql executable to your PATH. Running `mysql` directly in the terminal will result in a "command not found" error.

## Add the Latest MySQL Version to PATH

Add the following to `~/.bashrc` to automatically pick up the latest MySQL version's path:

```bash
echo 'export PATH=`printf "%s"$'\''\n'\'' /Users/Shared/DBngin/mysql/* | sort -Vr | head -n1`/bin:$PATH' >> ~/.bashrc
```

After reopening the terminal, you can use the `mysql` command directly.
