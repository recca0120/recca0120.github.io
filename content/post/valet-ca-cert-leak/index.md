---
title: '打開 analytics.google.com 卻看到 Laravel Valet 憑證？根本原因與修復方法'
description: '在本機開發環境用 Laravel Valet，卻在瀏覽器看到外部網站（如 analytics.google.com）顯示 Valet 自簽憑證。整理這個問題的完整成因——dnsmasq 洩漏、nginx catch-all、瀏覽器憑證快取——以及逐步排查與修復的方法。'
slug: valet-ca-cert-leak
date: '2026-04-15T12:00:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- laravel-valet
- ssl
- nginx
- dnsmasq
- macos
draft: false
---

某天開著 Chrome 瀏覽 `analytics.google.com`，點開憑證資訊卻看到：

```
核發對象：myproject.test
發行者：Laravel Valet CA Self Signed CN
```

這不是 Google 的憑證，是你本機 Laravel Valet 的自簽 CA 跑出來了。

這不是瀏覽器 bug，也不是 Google 出問題——是本機開發環境的設定導致外部流量被 Valet 的 nginx 攔截。

## 問題是怎麼發生的

Valet 用三個元件組成本機開發環境：

1. **dnsmasq**：把 `*.test` domain 導向 `127.0.0.1`
2. **nginx**：在 `127.0.0.1` 接流量，依 `server_name` 找對應的本機站台
3. **Valet CA**：為每個 `.test` 站台簽發 HTTPS 憑證

正常情況下，`/etc/resolver/test` 只把 `*.test` 查詢導給 dnsmasq，外部 domain 走系統 DNS，兩邊互不干擾。

但有幾種情況會讓這個邊界破掉。

### 原因一：dnsmasq 設定過於寬鬆

`~/.config/valet/dnsmasq.d/tld-test.conf` 的正確內容是：

```
address=/.test/127.0.0.1
```

如果這一行變成沒有限定 TLD 的格式，或 dnsmasq 全域設定有其他 `address` 規則，就可能把不在白名單的 domain 也解析到 `127.0.0.1`。

### 原因二：nginx default server 吃到外部 domain

nginx 收到一個請求，如果 `Host` header 找不到對應的 `server_name`，就會落到 **default server block**。Valet 的 default block 不是直接拒絕，而是用 Valet PHP server 兜底——這時就會拿最後載入的 `.test` vhost 的憑證來回應。

### 原因三：瀏覽器快取了錯誤狀態

Chrome 有 HSTS（強制 HTTPS）以及 TLS session 快取。如果曾經有一次外部 domain 被 Valet 的憑證回應，Chrome 可能把這個連線狀態快取下來，之後每次都重複出現，即使底層 DNS 問題修好了也一樣。

### 為什麼 analytics.google.com 特別常中招

Google Analytics 是**第三方 script**，常被本機專案的 HTML 引入。本機站台跑在 Valet 環境，如果 dnsmasq 在那個瞬間有洩漏，瀏覽器解析 `analytics.google.com` 就拿到 `127.0.0.1`，連上 nginx，nginx 找不到對應 server block，吐出 Valet 憑證。

## 逐步排查

**第一步：確認 dnsmasq 有沒有攔截外部 domain**

```bash
dig analytics.google.com @127.0.0.1
```

正常結果：回傳 `SERVFAIL` 或真實 Google IP。  
異常結果：回傳 `127.0.0.1` → dnsmasq 設定有問題，繼續往下查。

**第二步：確認 dnsmasq 規則只限定 `.test`**

```bash
cat ~/.config/valet/dnsmasq.d/tld-test.conf
```

應該只有：

```
address=/.test/127.0.0.1
listen-address=127.0.0.1
```

**第三步：確認 `/etc/resolver/` 目錄沒有多餘的檔案**

```bash
ls /etc/resolver/
```

應該只看到 `test`（或你設定的 TLD），沒有空白檔名或通配符。

**第四步：確認 nginx default server 的行為**

```bash
nginx -T 2>/dev/null | grep -A 5 "default_server"
```

看 default server 有沒有 `return 444` 或 `return 400`。如果沒有，就是用第一個 vhost 兜底。

## 修復方法

### 修復一：清除瀏覽器 HSTS 與 socket 快取

這是最常見的情況，即使底層沒問題，快取就能讓問題持續。

**Chrome**：
1. 網址列輸入 `chrome://net-internals/#hsts`
2. 在「Delete domain security policies」欄位輸入 `analytics.google.com`，點 Delete
3. 再到 `chrome://net-internals/#sockets` 點 **Flush socket pools**

**Safari**：
偏好設定 → 隱私權 → 管理網站資料 → 搜尋受影響的 domain → 移除

### 修復二：清除系統 DNS 快取

```bash
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

### 修復三：讓 nginx 拒絕未知 Host

在 Valet 的 nginx 設定加一個明確的 default server block，讓陌生 domain 連線直接被切斷，不要兜底到 `.test` vhost：

找到 Valet nginx 設定目錄：

```bash
ls /opt/homebrew/etc/nginx/valet/
```

新增或編輯一個 `_reject-default.conf`：

```nginx
server {
    listen 127.0.0.1:80 default_server;
    listen 127.0.0.1:443 ssl default_server;
    server_name _;

    ssl_certificate /dev/null;
    ssl_certificate_key /dev/null;

    return 444;
}
```

`444` 是 nginx 特有的狀態碼，代表直接關閉連線不回任何回應。

套用：

```bash
valet restart
```

### 修復四：重新安裝 Valet CA（若信任鏈混亂）

如果 Keychain 裡的 Valet CA 憑證狀態怪異：

```bash
valet trust   # 重新把 Valet CA 加進系統信任
```

或完整重建：

```bash
valet unsecure --all
valet secure <site-name>
```

## 驗證修復結果

```bash
# 確認外部 domain 不再被 dnsmasq 攔截
dig analytics.google.com @127.0.0.1
# 期望：SERVFAIL 或真實 IP，不是 127.0.0.1

# 確認 nginx 解析正確
curl -I --resolve analytics.google.com:443:127.0.0.1 https://analytics.google.com 2>&1 | head -5
# 期望：連線被拒或 SSL 握手失敗（不是吐出 Valet 憑證）
```

重新打開 Chrome，訪問 `analytics.google.com`，點憑證圖示確認發行者是 Google，不是 Laravel Valet CA。

## 預防

- **不要隨意修改 dnsmasq 全域設定**，Valet 的 dnsmasq 規則只應針對你設定的 TLD
- **每次 `valet install` 或 Valet 大版本升級後**，重新確認 dnsmasq 規則沒有被改寬
- **養成習慣**：本機 `.test` 站台的 HTML 盡量不引入外部 analytics script，減少觸發機會
- **加 nginx default reject block** 一勞永逸，讓意外洩漏的流量在 nginx 層就被切斷

## 參考資源

- [Laravel Valet 官方文件](https://laravel.com/docs/valet)
- [dnsmasq man page](https://thekelleys.org.uk/dnsmasq/doc.html)
- [Chrome net-internals 工具](chrome://net-internals/)
- [nginx return 444 — drop connection](https://nginx.org/en/docs/http/ngx_http_rewrite_module.html#return)
