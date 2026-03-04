---
title: '用 Mole 管理 SSH Tunnel：別名、自動重連、背景執行一次搞定'
date: '2026-03-09T09:00:00+08:00'
slug: mole-ssh-tunnel
description: 'Mole 是用 Go 寫的 SSH tunnel 管理工具，支援別名儲存、自動重連、背景執行、多條 tunnel 共用一條 SSH 連線，比直接打 ssh -L 指令方便太多。'
categories:
  - 工具
tags:
  - ssh
  - tunnel
  - mole
  - developer-tools
  - devops
---

每次要連到遠端的 MySQL 或 Redis，都要找之前的 `ssh -L` 指令，改一改 port 再跑。
三個月後再用，指令又忘了。
[Mole](https://github.com/davrodpin/mole) 讓你把這些設定存成別名，下次一個指令就搞定。

## SSH Tunnel 的問題

`ssh -L` 本身沒什麼問題，語法就是這樣：

```bash
# 把本地 3306 接到遠端主機 172.16.0.10:3306，透過 jump server
ssh -L 3306:172.16.0.10:3306 user@jump.example.com
```

但幾個狀況讓它用起來很煩：

**指令太長**：每次都要記 jump server、遠端 IP、兩個 port，打錯一個就沒法用。

**連線會斷**：SSH 閒置一段時間，server 會把你踢掉。斷了要自己重連。

**背景執行麻煩**：要加 `-f -N` 才能背景跑，停的時候還要手動 `kill`。

**多個 tunnel 要開多個 terminal**：連 MySQL 一條、Redis 一條，很快就開了一排視窗。

Mole 把這四個問題都解決了。

## 安裝

```bash
# macOS（Homebrew）
brew tap davrodpin/homebrew-mole
brew install mole

# macOS（MacPorts）
sudo port install mole

# Linux / macOS 通用安裝腳本
bash <(curl -fsSL https://raw.githubusercontent.com/davrodpin/mole/master/tools/install.sh)
```

裝好後確認版本：

```bash
mole version
```

## 基本用法：local tunnel

Local tunnel 是最常用的類型：把本地端的 port 透過 jump server 轉到遠端服務。

```bash
mole start local \
  --source 127.0.0.1:3306 \     # 本地監聽的 address:port
  --destination 172.16.0.10:3306 \  # 遠端目標 address:port
  --server ec2-user@jump.example.com:22  # SSH jump server
```

這樣 `127.0.0.1:3306` 就會接到遠端的 MySQL。跟這個 ssh 指令等效：

```bash
ssh -L 3306:172.16.0.10:3306 ec2-user@jump.example.com
```

不用記 port 也可以，讓 Mole 自動選：

```bash
# 省略 --source 的 port，Mole 自動找一個空閒的 port
mole start local \
  --source 127.0.0.1 \
  --destination 172.16.0.10:3306 \
  --server ec2-user@jump.example.com
```

啟動後 Mole 會告訴你用哪個 port，直接連那個就行。

## 多條 tunnel 共用一條連線

同一個 jump server 可以同時開多條 tunnel，不需要開多個 SSH 連線：

```bash
mole start local \
  --source :3306 \                    # MySQL
  --source :6379 \                    # Redis
  --destination 172.16.0.10:3306 \
  --destination 172.16.0.10:6379 \
  --server ec2-user@jump.example.com
```

兩個 `--source` 對應兩個 `--destination`，順序要對應。

## 別名：存起來下次直接用

每次都打完整指令很累，用 `mole add` 存成別名：

```bash
mole add local prod-mysql \
  --source 127.0.0.1:3306 \
  --destination 172.16.0.10:3306 \
  --server ec2-user@jump.example.com \
  --key ~/.ssh/prod-key.pem
```

之後要連就：

```bash
mole start local prod-mysql
```

一個字就省掉整串指令。看所有存的別名：

```bash
mole show aliases
```

不用了就刪掉：

```bash
mole delete prod-mysql
```

## 背景執行

加 `--detach` 讓 Mole 在背景跑，不佔用 terminal：

```bash
mole start local prod-mysql --detach
```

Mole 會回傳一個 instance ID，像這樣：

```
instance id: abc123de
```

查看所有在跑的 tunnel：

```bash
mole show instances
```

看特定 instance 的 log：

```bash
mole show logs --follow abc123de
```

停掉它：

```bash
mole stop abc123de
```

## Remote Tunnel

Local tunnel 是「把遠端服務拉到本地」，Remote tunnel 反過來，是「把本地服務暴露到遠端」。

```bash
mole start remote \
  --source 0.0.0.0:8080 \       # 遠端 server 上監聽的 port
  --destination 127.0.0.1:3000 \ # 本地要暴露的服務
  --server user@remote.example.com
```

這樣 `remote.example.com:8080` 就會接到你本地跑的 `localhost:3000`，適合臨時讓外部測試你的開發環境。

## 整合 ~/.ssh/config

如果 `~/.ssh/config` 已經設好 jump server：

```
# ~/.ssh/config
Host prod-jump
  User ec2-user
  Hostname jump.example.com
  Port 22
  IdentityFile ~/.ssh/prod-key.pem
```

Mole 直接讀這個設定，不用再指定 user 和 key：

```bash
mole start local \
  --source :3306 \
  --destination 172.16.0.10:3306 \
  --server prod-jump    # 用 Host 名稱就好
```

## 自動重連

這是 Mole 比直接用 `ssh -L` 好的地方。連線斷掉時，Mole 自動重連，不需要手動介入。背景執行加上自動重連，一個 tunnel 設好就不用管了。

keep-alive 的部分，Mole 會定時送 synthetic packet 讓連線保持活著，減少被 server 踢掉的機率。

## AWS EC2 + ElastiCache 範例

實際場景：開發機不在 VPC 裡，要連 ElastiCache（Redis）需要透過 EC2 跳板。

```bash
# 存成別名，key 用 .pem 檔
mole add local prod-redis \
  --source :6380 \
  --destination my-cluster.0001.euw1.cache.amazonaws.com:6379 \
  --server ec2-user@10.0.1.100 \
  --key ~/aws/prod.pem

# 背景跑
mole start local prod-redis --detach

# 用 redis-cli 測試
redis-cli -p 6380 ping
```

同理可以連 RDS，把 `--destination` 換成 RDS endpoint 就行。

## 什麼時候用 Mole，什麼時候直接 ssh -L

如果只是臨時連一下，`ssh -L` 完全夠。Mole 適合：

- 常用的 tunnel（存別名，重複使用）
- 需要長時間背景跑（自動重連、`--detach`）
- 一次開多條 tunnel（`--source`/`--destination` 多組）
- 團隊共用設定（把別名設定存進 repo）

一次設好，之後一個指令就開連線，省掉很多重複工。
