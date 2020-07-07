title: 如何在樹莓派上部署 usbip server
urlname: how-to-setup-usbip-server-on-raspberry-pi
comments: true
categories:
  - usbip
author: recca0120
abbrlink: 15047
date: 2020-07-07 14:44:11
updated: 2020-07-07 14:44:11
tags:
keywords:
description:
---
```bash
sudo apt update
sudo apt upgrade
```

We’re looking for the device identifier for the USB radio, which in my case is that Cygnal Integrated Products, Inc. device with an ID of 10c4:8a2a. We’ll then setup a systemd service definition that is going to search for that device string and attach it to the USBIPd service. If you’re using a different USB device, change the device ID in the lines below for ExecStartPost and ExecStop

```bash
# Install usbip and setup the kernel module to load at startup
sudo apt install usbip
sudo modprobe usbip_host
sudo echo 'usbip_host' >> /etc/modules
```

```bash
vi usbip_autorun.sh
```
```shellscript
#!/bin/bash

function start() {
    devices=$(usbip list -p -l)
    for device in $devices
    do
        if [[ $device == *"072f:b100#" ]]; then
            busid=$(echo "$device" | sed "s|#.*||g;s|busid=||g")
            echo "$(date -Iseconds): Exporting $busid"
            usbip bind --busid="$busid"
        fi
    done
}

function stop() {
    devices=$(usbip list -p -l)
    for device in $devices
    do
        busid=$(echo "$device" | sed "s|#.*||g;s|busid=||g")
        usbip unbind --busid="$busid"
    done
}

if [ "$1" == "stop" ]; then
    stop
else
    start
fi
```

```bash
# Create a systemd service
vi /lib/systemd/system/usbipd.service
```

Copy and paste the following service definition:

```bash
[Unit]
Description=usbip host daemon
After=network.target

[Service]
Type=forking
ExecStart=/usr/sbin/usbipd -D
ExecStartPost=/bin/bash /home/pi/usbip_autorun.sh
ExecStop=/bin/bash -c "/home/pi/usbip_autorun.sh stop; killall -9 usbipd"

[Install]
WantedBy=multi-user.target
```

Save that file, then run the following commands in your shell:

```bash
# reload systemd, enable, then start the service
sudo systemctl --system daemon-reload
sudo systemctl enable usbipd.service
sudo systemctl start usbipd.service
```

```bash
vi /etc/udev/rules.d/usb.rules
ACTION=="add", SUBSYSTEM=="usb", RUN+="/bin/bash /home/pi/usbip_autorun.sh >> /home/pi/usbip.log 2>&1"
```

```bash
systemctl restart systemd-udevd
```