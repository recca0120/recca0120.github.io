---
title: 'reverse_ssh：用標準 SSH 語法管理反向連線，穿透防火牆不需要 VPN'
date: '2026-03-27T09:00:00+08:00'
slug: reverse-ssh
description: 'reverse_ssh 把 SSH 反向：目標機主動連回 server，operator 再用原生 SSH 語法連進去。支援 HTTP/WebSocket/TLS 多種 transport 穿防火牆，SCP/SFTP/port forwarding 全部可用。'
categories:
  - 工具
tags:
  - ssh
  - reverse-shell
  - security
  - networking
  - golang
---

想連到一台在 NAT 後面的機器，沒有公開 IP，防火牆也擋了 inbound 連線。
傳統做法是架 VPN 或用 ngrok 之類的 tunnel，但都需要在目標機上裝額外工具和設定。
[reverse_ssh](https://github.com/NHAS/reverse_ssh) 讓目標機主動連回你的 server，然後你用一般的 `ssh` 指令連進去，SCP、SFTP、port forwarding 全部都能用。

## 架構

傳統 SSH 是你主動連到目標機（需要目標機有公開 IP 或你在同一個網路）：

```
你 ──SSH──→ 目標機（需要 inbound 可達）
```

reverse_ssh 反過來：

```
目標機 ──連回──→ RSSH Server ←──SSH── 你
```

目標機只需要能**對外連出**，不需要 inbound 連線，防火牆通常不擋 outbound。

## 架設 Server

最快的方式是 Docker：

```bash
docker run -d \
  --name rssh \
  -p 3232:2222 \
  -e EXTERNAL_ADDRESS=your-server.com:3232 \
  -e SEED_AUTHORIZED_KEYS="$(cat ~/.ssh/id_ed25519.pub)" \
  -v ./data:/data \
  --restart unless-stopped \
  reversessh/reverse_ssh
```

- `EXTERNAL_ADDRESS`：你的 server 對外的位址，client 連回來用這個
- `SEED_AUTHORIZED_KEYS`：你的 SSH 公鑰，用這個連進 server console 管理

確認 server 跑起來：

```bash
ssh -p 3232 your-server.com
# 進入 RSSH console
```

## 部署 Client

在目標機上執行：

```bash
# 從 server 的 web 介面下載 client binary
# （server 自動 host 編譯好的 binary）
curl https://your-server.com:3232/client -o rssh-client
chmod +x rssh-client
./rssh-client your-server.com:3232
```

或者在 RSSH console 裡用 `link` 指令產生 client：

```
rssh> link --name my-machine --expiry 24h
# 輸出一個 curl 指令，直接在目標機執行就能連上來
```

## 連到目標機

Client 連上來之後，在 RSSH console 裡列出已連線的機器：

```
rssh> ls
# my-machine  192.168.1.100  linux/amd64  2m ago
```

用標準 SSH jump host 語法連進去：

```bash
# -J 指定 jump host
ssh -J your-server.com:3232 my-machine

# 也可以用 ProxyJump 在 ~/.ssh/config 設定
Host rssh-*
  ProxyJump your-server.com:3232

# 然後直接
ssh rssh-my-machine
```

## SCP 和 SFTP

因為走的是標準 SSH 協議，SCP 和 SFTP 直接可用：

```bash
# 複製檔案到目標機
scp -J your-server.com:3232 file.txt my-machine:/tmp/

# SFTP
sftp -J your-server.com:3232 my-machine

# rsync（走 SSH）
rsync -avz -e "ssh -J your-server.com:3232" ./local/ my-machine:/remote/
```

## Port Forwarding

```bash
# Local forwarding：把目標機的 8080 port 轉到本地 9090
ssh -J your-server.com:3232 -L 9090:localhost:8080 my-machine

# Remote forwarding
ssh -J your-server.com:3232 -R 8080:localhost:3000 my-machine

# SOCKS proxy（把目標機當跳板）
ssh -J your-server.com:3232 -D 1080 my-machine
```

## 穿透嚴格防火牆：多種 Transport

如果目標機的環境只允許特定 port 出去，RSSH 支援多種 transport：

```bash
# HTTP polling（幾乎所有環境都能出去）
./rssh-client http://your-server.com:80

# HTTPS
./rssh-client https://your-server.com:443

# WebSocket
./rssh-client ws://your-server.com:80

# WebSocket over TLS
./rssh-client wss://your-server.com:443
```

不同 transport 可以在 server 上同時監聽，client 選最適合的出口。

## 持久化連線

讓 client 在目標機開機後自動連回來：

```bash
# Linux systemd
cat > /etc/systemd/system/rssh.service << EOF
[Unit]
Description=RSSH Client
After=network.target

[Service]
ExecStart=/usr/local/bin/rssh-client your-server.com:3232
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now rssh
```

## 適用情境

- **遠端維護 NAT 後的設備**：家裡的 NAS、IoT 設備、辦公室內網機器
- **Lab 環境管理**：一批 VM 全部連回同一個 console 統一管理
- **Pentest / 滲透測試**：授權測試環境中管理 shell，工具的設計符合這類需求
- **跨防火牆開發**：雲端 CI 機器連回本地開發環境

## 安全注意事項

- Server 要限制 `authorized_keys`，只讓信任的 operator 登入 console
- Client binary 裡面 hardcode 了 server 的 fingerprint，避免中間人攻擊
- `data/keys/` 目錄要備份，重新產 server key 會讓已部署的 client 無法連回來
- 非授權環境不要用，這個工具在設計上對防禦端不友善

## 小結

reverse_ssh 的核心價值是：用你已經熟悉的 SSH 工具操作反向連線，不需要學新的協議或工具。目標機連上 server 之後，剩下的就是標準 SSH 操作，`-J` jump host 一行搞定。

多種 transport 讓它在嚴格的網路環境也能用，HTTP polling 基本上任何能上網的機器都能連出去。
