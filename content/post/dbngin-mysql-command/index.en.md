---
title: 'Fix the Missing mysql Command After Installing DBngin'
description: 'DBngin supports multiple MySQL versions but never adds them to PATH. Add one line to .bashrc pointing to the latest version to get the mysql command working.'
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

[DBngin](https://dbngin.com/) lets you run multiple versions of MySQL, PostgreSQL, and Redis simultaneously. However, since it supports multiple versions, it doesn't automatically add the mysql executable to your PATH. Running `mysql` directly in the terminal will result in a "command not found" error.

## Add the Latest MySQL Version to PATH

Add the following to `~/.bashrc` to automatically pick up the latest MySQL version's path:

```bash
echo 'export PATH=`printf "%s"$'\''\n'\'' /Users/Shared/DBngin/mysql/* | sort -Vr | head -n1`/bin:$PATH' >> ~/.bashrc
```

After reopening the terminal, you can use the `mysql` command directly.

## References

- [DBngin Official Website](https://dbngin.com/)
- [MySQL Docs — The mysql Command-Line Client](https://dev.mysql.com/doc/refman/8.0/en/mysql.html)

