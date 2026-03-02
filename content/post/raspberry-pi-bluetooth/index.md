---
title: 樹莓派用 command 連結藍芽
slug: raspberry-pi-connect-bluetooth-using-command
date: '2020-07-21T14:48:18+08:00'
categories:
- DevOps
tags:
- Raspberry Pi
- Bluetooth
draft: false
image: featured.png
---

## 前言

樹莓派沒有桌面環境的時候，配對藍芽裝置只能靠 command line。用 `bluetoothctl` 就能搞定。

## 步驟

進入 bluetoothctl 互動模式：

```bash
sudo bluetoothctl
```

啟用 agent（處理配對請求用的）：

```bash
agent on
default-agent
```

開始掃描附近的藍芽裝置：

```bash
scan on
```

等目標裝置出現後，記下它的 MAC address，然後依序執行配對、信任、連線：

```bash
pair xx:xx:xx:xx:xx:xx
trust xx:xx:xx:xx:xx:xx
connect xx:xx:xx:xx:xx:xx
```

`trust` 這步很重要，加了之後下次開機會自動重新連線，不用再手動配對。
