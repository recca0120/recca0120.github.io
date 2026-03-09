---
title: 'Install Docker CE on WSL2 Without Docker Desktop'
description: 'Install Docker CE in WSL2 without Docker Desktop: add your user to the docker group to run without sudo and enable systemd for automatic Docker startup on boot.'
slug: wsl2-install-docker-ce
date: '2023-01-15T10:00:00+08:00'
categories:
  - DevOps
  - Windows
tags:
  - Docker
  - WSL2
  - Linux
image: featured.jpg
draft: false
---

After setting up WSL2, if you want to run Docker but don't want Docker Desktop (resource-heavy and requires a license), installing Docker CE directly in WSL2 is the cleaner approach.

## Installation Steps

Update the package list and install the dependencies needed for apt to use HTTPS:

```bash
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg lsb-release
```

Add Docker's official GPG key:

```bash
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

Set up the Docker apt repository:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker Engine:

```bash
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

## Verify Installation

Run hello-world to confirm Docker is working:

```bash
sudo docker run hello-world
```

To avoid typing `sudo` every time, add yourself to the `docker` group:

```bash
sudo usermod -aG docker $USER
```

Open a new terminal for the change to take effect.

## WSL2 Notes

WSL2 doesn't start systemd by default, so the Docker daemon may not start automatically. You'll need to start it manually each time you open WSL2:

```bash
sudo service docker start
```

Alternatively, enable systemd support in `/etc/wsl.conf` (requires Windows 11 22H2 or later):

```ini
[boot]
systemd=true
```

After making the change, restart WSL2 and Docker will start automatically.

## References

- [Install Docker Engine on Ubuntu (official docs)](https://docs.docker.com/engine/install/ubuntu/)
- [WSL documentation: Use systemd in WSL 2 (Microsoft docs)](https://learn.microsoft.com/en-us/windows/wsl/systemd)
- [Docker post-installation steps for running without sudo](https://docs.docker.com/engine/install/linux-postinstall/)
