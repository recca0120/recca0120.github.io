---
title: 'Fix macOS PHP NSCFConstantString Fork Error with One Env Var'
description: 'macOS artisan tinker throws an NSCFConstantString fork error when Guzzle is used. Set OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES in ~/.zshrc to fix it permanently.'
slug: php-objc86150-nscfconstantstring-initialize-may-have-been-in-progress-in-another-thread
date: '2022-12-26T08:41:00+08:00'
categories:
- macOS
- PHP
tags:
- PHP
- Guzzle
image: featured.jpg
draft: false
---

When using Guzzle Client in `artisan tinker`, macOS throws `objc[86150]: +[__NSCFConstantString initialize] may have been in progress in another thread when fork() was called`. This is caused by the Objective-C runtime's safety check during fork.

## Disable the Fork Safety Check

Set an environment variable to skip the check:

```bash
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
```

Add it to `~/.bashrc` or `~/.zshrc` so you don't have to set it manually every time.

## References

- [GuzzleHttp GitHub Repository](https://github.com/guzzle/guzzle) — Guzzle HTTP client source code and issue tracker
- [Laravel Artisan Tinker Documentation](https://laravel.com/docs/artisan#tinker) — artisan tinker REPL usage guide
- [macOS fork() Safety: OBJC_DISABLE_INITIALIZE_FORK_SAFETY](https://www.mikeash.com/pyblog/friday-qa-2012-01-20-objective-c-messaging.html) — Background on Objective-C runtime and fork safety
