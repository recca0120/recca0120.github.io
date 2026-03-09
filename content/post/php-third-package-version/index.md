---
title: '用 Composer InstalledVersions 在程式中取得套件版本號'
description: '用 Composer 2 的 InstalledVersions::getVersion() 在執行期取得套件版本，無需解析 composer.lock。'
slug: php-third-package-version
date: '2023-02-25T10:04:03+08:00'
categories:
  - PHP
tags:
  - PHP
  - Composer
image: featured.jpg
draft: false
---

有時候需要在程式裡判斷某個 Composer 套件的版本號，例如做向下相容或 feature flag。

## 用 InstalledVersions 取得版本

Composer 2 內建的 [`InstalledVersions`](https://getcomposer.org/doc/07-runtime.md#installed-versions) class 可以直接查詢任何已安裝套件的版本：

```php
use Composer\InstalledVersions;

InstalledVersions::getVersion('laravel/framework');
```

## 參考資源

- [Composer 官方文件：InstalledVersions 執行期 API](https://getcomposer.org/doc/07-runtime.md#installed-versions) — InstalledVersions class 完整方法說明
- [Composer GitHub 儲存庫](https://github.com/composer/composer) — Composer 原始碼與 changelog
- [PHP 官方文件：命名空間與 use 陳述式](https://www.php.net/manual/zh/language.namespaces.php) — PHP 命名空間基礎說明
