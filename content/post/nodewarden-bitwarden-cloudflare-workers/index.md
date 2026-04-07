---
title: 'NodeWarden：跑在 Cloudflare Workers 上的 Bitwarden，不用自架伺服器'
description: 'NodeWarden 是第三方 Bitwarden 相容服務端，跑在 Cloudflare Workers 上，資料存 D1，附件放 R2 或 KV。不用維護 VPS，免費額度就能跑。'
slug: nodewarden-bitwarden-cloudflare-workers
date: '2026-04-07T17:34:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- Cloudflare
- Bitwarden
- TypeScript
- serverless
draft: false
---

自架 Bitwarden 有兩條路。官方版本要跑 Docker，吃記憶體。[Vaultwarden](https://github.com/dani-garcia/vaultwarden) 用 Rust 重寫，輕量很多，但你還是需要一台 VPS、要設定 HTTPS、要定期更新、要備份資料庫。

[NodeWarden](https://github.com/shuaiplus/nodewarden) 走第三條路：直接跑在 Cloudflare Workers 上。不用 VPS、不用管 SSL、不用顧 uptime。Cloudflare 的免費額度就能跑。

## 跟 Vaultwarden 差在哪

Vaultwarden 是目前最多人用的第三方 Bitwarden 服務端，用 Rust 寫的，跑在 Docker 裡。NodeWarden 用 TypeScript 寫，跑在 Cloudflare Workers 上。

| | Vaultwarden | NodeWarden |
|---|---|---|
| 語言 | Rust | TypeScript |
| 部署 | Docker / VPS | Cloudflare Workers |
| 資料庫 | SQLite / MySQL / PostgreSQL | Cloudflare D1 |
| 附件儲存 | 本地檔案系統 | R2 或 KV |
| SSL | 要自己設定 | Cloudflare 自動處理 |
| 維護 | 要自己更新、備份 | Fork + 自動同步上游 |
| 費用 | VPS 月費 | Cloudflare 免費額度 |
| 組織/集合 | 支援 | 不支援 |

最大的差異就是運維負擔。Vaultwarden 要你顧一台 VPS，NodeWarden 完全 serverless。壞處是少了組織和集合功能，不適合團隊用。

## 技術架構

NodeWarden 完全建在 Cloudflare 的基礎設施上：

- **運算**：Cloudflare Workers（serverless）
- **資料庫**：D1（Cloudflare 的 SQLite）
- **附件儲存**：R2（物件儲存）或 KV（key-value）
- **前端**：Preact（原創 Web Vault 介面）

兩種儲存方案的差異：

| 方案 | 需要綁卡 | 單個附件上限 | 免費額度 |
|------|---------|------------|---------|
| R2 | 需要 | 100 MB（可調） | 10 GB |
| KV | 不需要 | 25 MiB（硬限制） | 1 GB |

如果你不想綁信用卡，用 KV 模式就好。1 GB 的免費額度對個人密碼管理綽綽有餘。需要存大附件才考慮 R2。

## 功能對照

跟官方 Bitwarden 比，個人使用該有的都有：

- Web Vault 網頁密碼庫
- 全量同步（`/api/sync`），相容官方客戶端
- 附件上傳下載
- Send 功能（文字和檔案）
- 導入導出（支援 Bitwarden JSON/CSV、ZIP 含附件）
- TOTP 和 Steam TOTP
- 多用戶（邀請碼註冊）
- 密碼提示（網頁端直接看，不用發 email）

NodeWarden 多了一個官方沒有的功能：**雲端備份中心**。支援 WebDAV 和 E3 協定定時備份，備份包含 `db.json`、`manifest.json` 和 `attachments/` 目錄。還原的時候缺少的附件會安全跳過，不會留下壞掉的記錄。

不支援的：組織、集合、權限管理、SSO、SCIM、企業目錄。這些是團隊功能，個人用不到。

### 客戶端相容性

已測試可用：

- Windows 桌面端
- 手機 App（iOS / Android）
- 瀏覽器擴充功能
- Linux 桌面端
- macOS 桌面端（未完整驗證）

## 部署方式

### 網頁部署（推薦）

最簡單的方式，不用裝任何東西：

1. Fork [NodeWarden 的 repo](https://github.com/shuaiplus/nodewarden)
2. 到 [Cloudflare Workers 控制台](https://dash.cloudflare.com) 建新專案
3. 選 Continue with GitHub，指向你 fork 的 repo
4. 保持預設設定，直接部署
5. 如果用 KV 模式，部署命令改成 `npm run deploy:kv`
6. 設定環境變數 `JWT_SECRET`（至少 32 字元的隨機字串）

整個過程不到五分鐘。

### CLI 部署

```bash
git clone https://github.com/shuaiplus/NodeWarden.git
cd NodeWarden
npm install
npx wrangler login

# R2 模式
npm run deploy

# KV 模式
npm run deploy:kv
```

本地開發：

```bash
npm run dev      # R2 模式
npm run dev:kv   # KV 模式
```

## 自動更新

Fork 之後，進 GitHub Actions 啟用 `Sync upstream` workflow，它會每天凌晨 3 點自動同步上游。不想等的話，在 fork 頁面點 Sync fork → Update branch 手動更新。

## 該用 NodeWarden 還是 Vaultwarden

如果你已經有一台穩定的 VPS，Vaultwarden 功能更完整，生態更成熟，社群更大。組織、集合、2FA 登入都支援。

NodeWarden 適合的情境：

- **不想管 VPS**。沒有伺服器就沒有維護問題，不用擔心 uptime、SSL 過期、磁碟滿了
- **預算是零**。Cloudflare 的免費額度對個人使用綽綽有餘
- **只有自己用**。不需要組織和權限管理
- **想要異地備份**。內建的 WebDAV 備份功能比 Vaultwarden 方便

最大的風險是你的密碼庫跑在 Cloudflare 的基礎設施上。D1 和 Workers 都還算新的服務，雖然 Cloudflare 大概不會突然關掉，但免費額度的限制和條款隨時可能改。定期備份到 WebDAV 是必要的。

另一個要注意的是 NodeWarden 的安全性沒有經過像 Vaultwarden 那樣長時間的社群審查。密碼管理器是高敏感度的應用，用之前自己評估風險。

## 參考資源

- [NodeWarden GitHub Repository](https://github.com/shuaiplus/nodewarden)
- [Vaultwarden — 用 Rust 寫的 Bitwarden 相容服務端](https://github.com/dani-garcia/vaultwarden)
- [Cloudflare D1 文件](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 文件](https://developers.cloudflare.com/r2/)
- [Bitwarden 官方網站](https://bitwarden.com/)
