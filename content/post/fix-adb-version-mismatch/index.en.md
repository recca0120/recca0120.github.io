---
title: 'Fix adb Server and Client Version Mismatch on Mac'
description: 'Homebrew and Android SDK each install a separate adb, causing server and client version conflicts. Remove the Homebrew copy and point PATH to the SDK to fix it.'
slug: fix-adb-server-version-does-not-match-this-client-problem
date: '2020-05-29T19:01:07+08:00'
categories:
- macOS
tags:
- Android
- macOS
draft: false
image: featured.png
---

## The Problem

After updating the Android SDK, running `adb devices` threw:

```
adb server version (41) doesn't match this client (40)
```

It turned out that I had previously installed `android-platform-tools` via Homebrew on my Mac, resulting in two different versions of adb on the system. The server and client were picking up different versions.

## The Fix

First, remove the Homebrew-installed copy:

```bash
brew cask uninstall android-platform-tools
```

Then add the Android SDK path to `~/.bashrc` so the system uses a single adb:

```bash
export ANDROID_HOME="/Users/recca0120/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$PATH"
```

Finally, run `source ~/.bashrc` to apply the changes, then `adb devices` should work normally.
