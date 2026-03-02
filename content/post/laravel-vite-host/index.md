---
title: 'Laravel Vite host 設定'
description: 'Laravel Vite 預設指向 localhost，自訂 domain 需在 vite.config.js 設定 server.host，搭配 Valet 則用 valetTls。'
slug: laravel-vite-host
date: '2023-03-20T07:08:10+08:00'
categories:
- Laravel
tags:
- Laravel
- Vite
image: featured.png
draft: false
---

Laravel Vite 用預設設定跑 `npm run dev` 時，`@vite` 會把 asset 路徑指向 `http://localhost`，如果開發環境用的是自訂 domain 就會載入失敗。

## 設定 server.host

在 `vite.config.js` 加上 `server.host` 和 `server.hmr.host`：

```javascript
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

const host = 'xxx.test';

export default defineConfig({
    server: {
        host: host,
        hmr: {
            host: host,
        },
    },
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
    ],
});
```

## 搭配 Valet 使用 HTTPS

如果用 Valet 且需要 HTTPS，先在專案目錄執行 `valet secure`，然後改用 `valetTls` 設定：

```javascript
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

const host = 'xxx.test';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
            valetTls: host,
        }),
    ],
});
```
