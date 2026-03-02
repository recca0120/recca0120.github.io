---
title: '修復 adb server/client 版本不一致的問題'
description: 'Mac 上 Homebrew 和 Android SDK 各裝一份 adb 導致版本衝突。移除 Homebrew 版並將 PATH 指向 SDK 即可解決。'
slug: fix-adb-server-version-does-not-match-this-client-problem
date: '2020-05-29T19:01:07+08:00'
categories:
- macOS
tags:
- Android
draft: false
image: featured.png
---

## 問題

更新 Android SDK 後跑 `adb devices`，結果噴了：

```
adb server version (41) doesn't match this client (40)
```

查了一下，原來是 Mac 上用 Homebrew 裝過 `android-platform-tools`，系統裡存在兩個不同版本的 adb，server 跟 client 各抓到不同的版本。

## 解法

先移除 Homebrew 裝的那份：

```bash
brew cask uninstall android-platform-tools
```

然後在 `~/.bashrc` 加上 Android SDK 的路徑，讓系統統一用 SDK 裡的 adb：

```bash
export ANDROID_HOME="/Users/recca0120/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$PATH"
```

最後 `source ~/.bashrc` 讓設定生效，再跑一次 `adb devices` 就正常了。
