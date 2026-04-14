---
title: '2026 年用 Cloudflare Tunnel：不開 port、不買 IP，把本機服務推上公網'
description: 'Cloudflare Tunnel 讓你從本機建立對外連線就能把 localhost 推上自己的網域，不需要開防火牆、不需要公網 IP。整理 2026 年最新的 remotely-managed tunnel 流程、Zero Trust Access 存取控制，以及和 ngrok、Tailscale Funnel 的取捨。'
slug: cloudflare-tunnel-2026
date: '2026-04-14T20:00:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- cloudflare
- tunnel
- zero-trust
- networking
draft: false
---

家裡跑了一個 side project，想讓客戶能看到 demo；公司 NUC 跑了內部工具，想在外面也能連進去。傳統做法是去買一個靜態 IP、在 router 上開 port forwarding、再自己搞 Let's Encrypt 憑證——這些步驟 2026 年都可以跳過。

Cloudflare Tunnel（cloudflared）幫你做完所有髒活：從本機**主動連出去**到 Cloudflare 邊緣節點，所有進來的流量走這條連線回你家。不用開 port、不用公網 IP、免費拿到 Cloudflare 的 DDoS 防護跟 WAF。

## 為什麼是 Cloudflare Tunnel

市面上類似工具不少，三個主流取向不太一樣：

| 工具 | 自訂網域 | 身份驗證 | 自架 relay | TCP 支援 | 免費上限 |
|------|---------|---------|-----------|---------|---------|
| Cloudflare Tunnel | ✅ 免費 | ✅ 內建 Access | ❌ CF 代管 | ✅ | 很寬鬆 |
| ngrok | 付費才有 | 付費加購 | ❌ | 付費 | 有連線數限制 |
| Tailscale Funnel | 有限 | ❌ | P2P | ❌ 僅 HTTPS | 只開 3 個 port |
| frp | 看你自己 | 自己接 | ✅ 要自架 | ✅ | 看你機器 |

**Tunnel 最大的差異**：它不只是「把流量導進來」，而是把你家服務接上 Cloudflare 整個 Zero Trust 平台——可以直接套 Access 做 SSO、email OTP、走 WAF 擋攻擊、要 SSH 的話用瀏覽器就能連。這些對 ngrok 是付費功能，對 Tailscale Funnel 是沒這東西。

## 2026 年推薦流程：Zero Trust Dashboard

過去用 `cloudflared` 多半靠 `config.yml` 本機設定。2026 年 Cloudflare 把主力推到 **remotely-managed tunnels**——設定在雲端 dashboard，本機 cloudflared 只拿一個 token 跑起來。好處是多台機器共用、改 ingress 不用重啟、多個 replica 自動 HA。

進入 [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Networks → Tunnels → Create a tunnel → Cloudflared**，取個名字之後複製安裝指令。

## 安裝 cloudflared

**macOS**：

```bash
brew install cloudflared
```

**Linux（Debian/Ubuntu）**：

```bash
curl -L https://pkg.cloudflare.com/install.sh | sudo bash
sudo apt install cloudflared
```

**Docker**：

```bash
docker run -d --name cf-tunnel --restart unless-stopped \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token eyJhbGci...
```

裝好之後，把 dashboard 給你的 token 塞進去：

```bash
sudo cloudflared service install eyJhbGci...TOKEN...
```

這條指令會建 systemd service（Linux）或 launchd plist（macOS），開機自動跑，當機自動重啟。回 dashboard 看 tunnel 狀態，綠燈 **Healthy** 就成了。

## 把 localhost:3000 推到 foo.example.com

前提：`example.com` 已經把 DNS 指到 Cloudflare（Name servers 換成 Cloudflare 那對）。

回到 tunnel 設定頁，切到 **Public Hostname** 頁籤 → **Add a public hostname**：

| 欄位 | 值 |
|------|---|
| Subdomain | `foo` |
| Domain | `example.com` |
| Service Type | `HTTP` |
| URL | `localhost:3000` |

存檔完，Cloudflare 自動幫你在 DNS 建一筆 CNAME：`foo.example.com → <tunnel-uuid>.cfargotunnel.com`。打開 `https://foo.example.com`，憑證是 Cloudflare 的 edge cert，你本機完全不用裝 TLS。

## 加身份驗證：Zero Trust Access

不想讓 demo 網址被陌生人掃到？加個登入閘：

**Zero Trust → Access → Applications → Add an application → Self-hosted**

- Application domain 填 `foo.example.com`
- 新增 policy：Action = **Allow**，Include = **Emails ending in `@yourco.com`**（或指定 email 清單）
- Identity provider 用預設的 **One-time PIN**（送 email OTP），或到 **Settings → Authentication** 接 Google SSO / GitHub

下次打開 `foo.example.com` 會先跳 Cloudflare 登入頁，認證通過才進得去。免費方案吃到 **50 個使用者**都免錢。

## TryCloudflare：一次性的 demo tunnel

要快速給人看個 webhook 或 demo，連帳號都懶得開：

```bash
cloudflared tunnel --url http://localhost:8080
```

跑起來會印一個 `https://<random-words>.trycloudflare.com`，隨機子網域、流量打回本機。關掉程序網址就失效。適合臨時，不適合長期，有 rate limit。

## 本機 config.yml 派（GitOps 派推薦）

要把 tunnel 設定放進 Git 版控、或跑 IaC（Terraform），還是可以用傳統方式：

```bash
cloudflared tunnel login
cloudflared tunnel create dev-laptop
cloudflared tunnel route dns dev-laptop foo.example.com
```

`~/.cloudflared/config.yml`：

```yaml
tunnel: dev-laptop
credentials-file: /Users/me/.cloudflared/<UUID>.json
ingress:
  - hostname: foo.example.com
    service: http://localhost:3000
  - hostname: api.example.com
    service: http://localhost:4000
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  - service: http_status:404
```

跑：`cloudflared tunnel run dev-laptop`

## 幾個踩過的坑

**Ingress 最後一定要放 catch-all**。沒寫 `- service: http_status:404` 的話 cloudflared 會拒絕啟動：

```yaml
ingress:
  - hostname: foo.example.com
    service: http://localhost:3000
  - service: http_status:404   # 少了這行會開不起來
```

**WebSocket 直接可用**。2022 之後預設支援，不用額外旗標。Next.js HMR、Socket.IO 都沒問題。

**SSH / RDP 也能走**。ingress 寫 `service: ssh://localhost:22`，對方不用裝 client，在 Access application 裡啟用 **Browser rendering**，瀏覽器就能開 SSH terminal。

**同一個 tunnel 開多個 replica**。同樣 token 在第二台機器再跑一次，Cloudflare 自動做 HA 跟 load balancing。主機重開機期間服務不中斷。

**originRequest per hostname**。每個 ingress 可以獨立設 `httpHostHeader`（改 Host header）、`connectTimeout`、`noTLSVerify`，不用為了一個服務改全域設定。

## 費用

- **Tunnel 本身：完全免費**，不限流量、不限條數、不限 bandwidth
- **Zero Trust Access：50 個使用者以下免費**，超過走 Cloudflare One pay-as-you-go 約 $7/user/月
- 沒有 egress fee、沒有連線數限制

對個人跟小團隊來說幾乎是白送。

## 2025–2026 的重要更新

**Dashboard 整併**：舊的 `dash.teams.cloudflare.com` 完全退役，統一走 `one.dash.cloudflare.com`。如果搜到舊教學點到老介面，換新網址就好。

**WARP Connector GA**：原本 tunnel 是「單一服務對外」，WARP Connector 把**整個內網網段**接上 Cloudflare。想讓員工 VPN 進辦公室網段、或站對站互連，這是新選擇。Tunnel + WARP Connector 搭起來就是 site-to-site VPN 的替代品。

**Cloudflare One 品牌整合**：Access、Gateway、Tunnel、WARP、CASB、DLP、Email Security 全合併成一個 SSE 平台。Zero Trust 選單下面現在一次能設完企業所有網路安全。

**Terraform provider v5** 穩定：tunnel 資源完整 IaC 化，多環境部署用 Terraform 一鍵建完。

**QUIC 成預設**：cloudflared 協定預設走 QUIC（HTTP/3），比舊的 HTTP/2 連線建立更快，壞網路環境也更穩。

## 什麼時候別用 Tunnel

雖然好用但不是萬用：

- **純 P2P 不經過第三方**：用 Tailscale / WireGuard
- **法規要求流量不能經美國/CF 網路**：走 self-hosted frp 或企業 VPN
- **超大流量靜態檔**：直接用 Cloudflare Pages / R2 比走 tunnel 合理
- **只想 5 分鐘 demo**：TryCloudflare 或 ngrok 更快，不用設網域

## 結語

2026 年架 demo 環境、接 webhook、開發過程中給同事看進度——這些 Cloudflare Tunnel 基本都是最省力的答案。免費額度大方，安全性有 Cloudflare 托底，從開發到上 production 都能用同一條路徑。

最短的上手只要三步：`brew install cloudflared` → dashboard 建 tunnel → 貼上 token。之後所有複雜度都在雲端 UI 點一點就好。

## 參考資源

- [Cloudflare Tunnel 官方文件](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [cloudflared GitHub](https://github.com/cloudflare/cloudflared)
- [Zero Trust Dashboard](https://one.dash.cloudflare.com)
- [TryCloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
- [Cloudflare Access 定價](https://www.cloudflare.com/plans/zero-trust-services/)
