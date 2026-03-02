---
title: 'PHP: objc[86150]: +[__NSCFConstantString initialize] may have been in progress in another thread…'
slug: php-objc86150-nscfconstantstring-initialize-may-have-been-in-progress-in-another-thread
date: '2022-12-26T08:41:00+08:00'
categories:
- macOS
tags:
- PHP
image: featured.png
draft: false
---

When using Guzzle Client in `artisan tinker`, macOS throws `objc[86150]: +[__NSCFConstantString initialize] may have been in progress in another thread when fork() was called`. This is caused by the Objective-C runtime's safety check during fork.

## Disable the Fork Safety Check

Set an environment variable to skip the check:

```bash
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
```

Add it to `~/.bashrc` or `~/.zshrc` so you don't have to set it manually every time.
