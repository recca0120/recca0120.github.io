---
title: 'sslh：443 port 同時跑 HTTPS 和 SSH，一個 port 多個服務'
date: '2026-03-28T09:00:00+08:00'
slug: sslh-port-multiplexer
description: 'sslh 是 protocol multiplexer，讓 SSH、HTTPS、OpenVPN 共用同一個 port。最常見的用途是把 SSH 藏在 443，穿透只開放 HTTP/HTTPS 的嚴格防火牆。'
categories:
  - 工具
tags:
  - sslh
  - ssh
  - networking
  - security
  - linux
---

公司或學校的網路只開放 80 和 443 對外，SSH 的 22 port 被擋死。
想連回家裡的 server，只能用 VPN 或 web-based terminal，都很麻煩。
[sslh](https://github.com/yrutschle/sslh) 讓你的 server 在 443 同時接 HTTPS 和 SSH，防火牆看到的永遠是 443，SSH 就這樣藏進去了。

## 原理

sslh 坐在 443 port 前面，收到連線之後先看第一個封包，判斷是 SSH 還是 TLS/HTTPS，再轉發到對應的後端服務。

```
外部連線 → 443
              ↓
           sslh（分析第一個封包）
              ├── SSH 封包  → 本地 22
              └── TLS 封包 → 本地 nginx:443
```

對 SSH client 來說，它以為自己連到 22，其實走的是 443。對 nginx 來說，它以為自己在聽 443，其實 sslh 幫它擋在前面。

支援的協議：SSH、TLS/HTTPS、HTTP、OpenVPN、SOCKS5、tinc、XMPP，以及自訂 regex pattern。

## 安裝

```bash
# Ubuntu / Debian
sudo apt install sslh

# Arch
sudo pacman -S sslh

# macOS（Homebrew）
brew install sslh

# Docker
docker pull ghcr.io/yrutschle/sslh:latest
```

## 最簡單的用法：command line

先試跑，確認行為再設定成 service：

```bash
# 讓 443 同時接 SSH（轉到本地 22）和 HTTPS（轉到本地 nginx 8443）
sudo sslh --listen=0.0.0.0:443 \
          --ssh=127.0.0.1:22 \
          --tls=127.0.0.1:8443
```

這樣跑之前，nginx 要先從 443 改到 8443（因為 443 現在給 sslh 用）：

```nginx
# /etc/nginx/sites-available/default
server {
    listen 8443 ssl;  # 改成 8443，sslh 接 443 再轉過來
    # ... 其他設定不變
}
```

## 設定檔

正式部署用設定檔，放在 `/etc/sslh.cfg`：

```cfg
# /etc/sslh.cfg

verbose: 0;
foreground: false;
inetd: false;
numeric: false;
transparent: false;

# sslh 監聽的 port
listen:
(
    { host: "0.0.0.0"; port: "443"; }
);

# 各協議轉發到哪裡
protocols:
(
    # SSH 轉到本地 22
    { name: "ssh";  host: "127.0.0.1"; port: "22";   log_level: 0; },
    # HTTPS 轉到 nginx
    { name: "tls";  host: "127.0.0.1"; port: "8443"; log_level: 0; },
    # 兜底：其他的也丟給 nginx
    { name: "anyprot"; host: "127.0.0.1"; port: "8443"; log_level: 0; }
);
```

啟動 service：

```bash
sudo systemctl enable sslh
sudo systemctl start sslh
sudo systemctl status sslh
```

## 客戶端連線

SSH client 指定 443 port：

```bash
# 直接指定 port
ssh -p 443 user@yourserver.com

# 或在 ~/.ssh/config 設定
Host myserver
    HostName yourserver.com
    Port 443
    User yourname
```

之後 `ssh myserver` 就直接走 443，不需要記得加 `-p 443`。

HTTPS 不需要改任何設定，瀏覽器連 `https://yourserver.com` 完全正常。

## Docker Compose 部署

如果用 Docker 管服務，sslh 可以作為一個 container 放在 nginx 前面：

```yaml
# docker-compose.yml
services:
  sslh:
    image: ghcr.io/yrutschle/sslh:latest
    ports:
      - "443:443"
    command: >
      --foreground
      --listen=0.0.0.0:443
      --tls=nginx:443
      --ssh=sshd:22
    depends_on:
      - nginx
      - sshd
    cap_add:
      - NET_RAW
      - NET_BIND_SERVICE
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    # nginx 不 expose 443，由 sslh 接管
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

  sshd:
    image: linuxserver/openssh-server
    environment:
      - PUBLIC_KEY_FILE=/keys/authorized_keys
    volumes:
      - ./keys:/keys
```

nginx 和 sshd container 不需要對外 expose port，sslh 幫它們做分流。

## 加上 OpenVPN

需要穿透防火牆的情境不只 SSH，OpenVPN 也常被擋。sslh 同樣可以處理：

```cfg
protocols:
(
    { name: "ssh";     host: "127.0.0.1"; port: "22";   },
    { name: "openvpn"; host: "127.0.0.1"; port: "1194"; },
    { name: "tls";     host: "127.0.0.1"; port: "8443"; },
    { name: "anyprot"; host: "127.0.0.1"; port: "8443"; }
);
```

OpenVPN client 把 remote 設成 `yourserver.com 443`，sslh 識別 OpenVPN 封包後轉到 1194。

## sslh vs 其他方案

| 方案 | 優點 | 缺點 |
|---|---|---|
| sslh | 輕量、多協議、無需改 client | server 需要 root，後端看不到真實 IP（需要 transparent mode）|
| [reverse_ssh](/p/reverse-ssh/) | client 主動連回，目標機不需要公開 IP | 需要中繼 server |
| HAProxy | 功能更強、支援 PROXY protocol | 設定複雜 |
| Nginx stream | 簡單、原生 TLS SNI | 只能做 TLS SNI 分流，SSH 分不了 |

如果目標是「SSH 穿防火牆」，sslh 是最直接的解法。如果目標機根本沒有公開 IP，[reverse_ssh](/p/reverse-ssh/) 是另一條路。

## 注意事項

**後端看不到真實 IP**：sslh 預設做 NAT，後端 server 看到的來源 IP 是 127.0.0.1，不是真實 client IP。如果需要真實 IP（fail2ban、access log），要設定 transparent proxy mode，需要額外的 iptables 規則。

**防火牆規則**：server 端要確認 443 是開的。如果原本 nginx 佔著 443，要先把 nginx 改到其他 port，再讓 sslh 接管 443。

**CVE 紀錄**：sslh 歷史上有過幾個 CVE，保持更新即可，不是阻礙使用的理由。

## 小結

一個 port 跑多個服務，sslh 幾行設定就搞定。最常見的用法是讓 SSH 藏在 443，繞過只允許 HTTP/HTTPS 的防火牆。設定好之後對 SSH client 完全透明，只是 port 從 22 改成 443，其他都一樣。
