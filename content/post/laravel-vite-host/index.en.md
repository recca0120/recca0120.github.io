---
title: 'Laravel Vite Assets Fail on Custom Domain? Set server.host'
description: 'Laravel Vite defaults to localhost, breaking assets on custom domains. Set server.host and server.hmr.host in vite.config.js, or use valetTls for Valet HTTPS.'
slug: laravel-vite-host
date: '2023-03-20T07:08:10+08:00'
categories:
- Laravel
- Frontend
tags:
- Laravel
- Vite
image: featured.jpg
draft: false
---

When running `npm run dev` with the default Laravel Vite config, `@vite` points asset paths to `http://localhost`. If your dev environment uses a custom domain, assets will fail to load.

## Setting server.host

Add `server.host` and `server.hmr.host` to `vite.config.js`:

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

## Using HTTPS with Valet

If you use Valet and need HTTPS, run `valet secure` in the project directory first, then use the `valetTls` option:

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
