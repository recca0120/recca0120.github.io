title: 解決 adb server version (41) doesn't match this client (40)
urlname: fix-adb-server-version-does-not-match-this-client-problem
comments: true
tags:
  - android
categories:
  - android
author: recca0120
abbrlink: 45924
date: 2020-05-29 19:01:07
updated: 2020-05-29 19:01:07
keywords:
description:
---

更新完 android sdk 後執行 `adb devices` 後系統回傳 `adb server version (41) doesn't match this client (40)` 這樣的訊息
發現原來在 mac 上已經用 brew 安裝了 android-platform-tools 才會造成 server 和 client 的 adb 版本不一致的問題
所以先執行 `brew cask uninstall android-platform-tools` 來移除 android-platform-tools 後，
再修改 ~/.bashrc 加入

```env
export ANDROID_HOME="/Users/recca0120/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$PATH"
```

再執行 `source ~/.bashrc` 就可以修復這個問題了

