---
title: 'Connect Bluetooth on a Headless Raspberry Pi via CLI'
description: 'Use bluetoothctl scan, pair, trust, and connect to pair Bluetooth devices on a headless Raspberry Pi without a desktop and auto-reconnect on every reboot.'
slug: raspberry-pi-connect-bluetooth-using-command
date: '2020-07-21T14:48:18+08:00'
categories:
  - DevOps
tags:
  - Raspberry Pi
  - Bluetooth
  - Linux
draft: false
image: featured.png
---

## Introduction

When the Raspberry Pi doesn't have a desktop environment, pairing Bluetooth devices can only be done via the command line. `bluetoothctl` is all you need.

## Steps

Enter the bluetoothctl interactive mode:

```bash
sudo bluetoothctl
```

Enable the agent (used for handling pairing requests):

```bash
agent on
default-agent
```

Start scanning for nearby Bluetooth devices:

```bash
scan on
```

Once the target device appears, note its MAC address, then run pair, trust, and connect in order:

```bash
pair xx:xx:xx:xx:xx:xx
trust xx:xx:xx:xx:xx:xx
connect xx:xx:xx:xx:xx:xx
```

The `trust` step is important -- once added, the device will automatically reconnect on the next boot without manual pairing.
