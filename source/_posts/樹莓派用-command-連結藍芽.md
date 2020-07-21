title: 樹莓派用 command 連結藍芽
urlname: raspberry-pi-connect-bluetooth-using-command
comments: true
tags:
  - raspberry pi
  - bluetooth
categories: raspberry pi
author: recca0120
abbrlink: 48420
date: 2020-07-21 14:48:18
updated: 2020-07-21 14:48:18
keywords:
description:
---
執行 bluetoothctl 後會顯示 `[bluetooth]`

```bash
sudo bluetoothctl
```

裝 agent 設為 on

```bash
agent on
default-agent
```

掃瞄裝置

```bash
scan on
```

配對

```bash
pair xx:xx:xx:xx:xx
```

信任裝置

```bash
trust xx:xx:xx:xx:xx
```

連線

```bash
connect xx:xx:xx:xx:xx
```

