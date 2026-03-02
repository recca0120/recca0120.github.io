---
title: 在 WSL2 安裝 Docker CE 取代 Docker Desktop
description: '不用 Docker Desktop，直接在 WSL2 安裝 Docker CE 的完整步驟，包含加入 docker 群組免 sudo、啟用 systemd 讓 Docker 開機自動啟動。'
slug: wsl2-install-docker-ce
date: '2023-01-15T10:00:00+08:00'
categories:
  - DevOps
  - Windows
tags:
  - Docker
  - WSL2
  - Linux
image: featured.png
draft: false
---

裝好 WSL2 之後想跑 Docker，但不想裝 Docker Desktop（吃資源又要授權），直接在 WSL2 裡裝 Docker CE 是比較乾淨的做法。

## 安裝步驟

先更新套件清單，裝好讓 apt 可以走 HTTPS 的相依套件：

```bash
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg lsb-release
```

加入 Docker 官方的 GPG key：

```bash
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

設定 Docker 的 apt repository：

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

安裝 Docker Engine：

```bash
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

## 驗證安裝

跑一下 hello-world 確認 Docker 正常運作：

```bash
sudo docker run hello-world
```

如果不想每次都打 `sudo`，把自己加進 `docker` 群組：

```bash
sudo usermod -aG docker $USER
```

重新開一個 terminal 就生效了。

## WSL2 注意事項

WSL2 預設不會啟動 systemd，所以 Docker daemon 可能不會自動跑起來。每次開 WSL2 要手動啟動：

```bash
sudo service docker start
```

或是在 `/etc/wsl.conf` 開啟 systemd 支援（Windows 11 22H2 以上）：

```ini
[boot]
systemd=true
```

改完重啟 WSL2 就不用每次手動啟動了。
