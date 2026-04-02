---
title: 'Mozart：WordPress 外掛的 Composer 依賴隔離工具'
date: '2026-04-04T09:00:00+08:00'
slug: mozart-composer-prefix
image: cover.jpg
description: 'WordPress 外掛共用一個 PHP process，不同外掛用同一個 library 的不同版本就會炸。Mozart 把你的 vendor 依賴加上自訂 namespace 前綴，徹底隔離，不跟別人衝突。'
categories:
  - PHP
tags:
  - mozart
  - composer
  - wordpress
  - php
  - namespace
---

WordPress 外掛開發有一個獨特的問題：所有外掛跑在同一個 PHP process 裡。

你的外掛用了 `guzzlehttp/guzzle 7.0`，另一個外掛用了 `guzzlehttp/guzzle 6.0`。兩個外掛各自 `composer install`，但最後只有一個版本會被載入——先跑到的那個。如果版本不相容，就直接 fatal error。

這不是你能控制的，因為你不知道用戶裝了哪些外掛。

[Mozart](https://github.com/coenjacobs/mozart) 的解法：把你的 vendor 依賴複製一份，全部加上你自己的 namespace 前綴，讓它們跟別人的完全不衝突。

## 問題的本質

PHP 的 class 是全域的。`GuzzleHttp\Client` 只能存在一個定義。

Mozart 把它改名成 `YourPlugin\Dependencies\GuzzleHttp\Client`，這樣就算別人也載入了原版的 `GuzzleHttp\Client`，兩者完全是不同的 class，互不干擾。

## 安裝

Mozart 本身有依賴，建議用 Docker 或 PHAR 隔離，避免 Mozart 自己的依賴污染你的 vendor：

```bash
# Docker（推薦）
docker run --rm -it -v ${PWD}:/project/ coenjacobs/mozart /mozart/bin/mozart compose

# 全域安裝（簡單但有風險）
composer global require coenjacobs/mozart

# PHAR
php mozart.phar compose
```

## 設定

在 `composer.json` 的 `extra` 加上 Mozart 設定：

```json
{
  "extra": {
    "mozart": {
      "dep_namespace": "MyPlugin\\Dependencies\\",
      "dep_directory": "/vendor-prefixed/",
      "classmap_prefix": "MyPlugin_",
      "packages": [
        "guzzlehttp/guzzle",
        "psr/http-client"
      ],
      "excluded_packages": [
        "psr/container"
      ],
      "delete_vendor_directories": true
    }
  }
}
```

設定說明：

| 選項 | 說明 |
|---|---|
| `dep_namespace` | 加在所有 namespace 前面的前綴 |
| `dep_directory` | 處理後的檔案放哪裡 |
| `classmap_prefix` | 沒有 namespace 的 class 加什麼前綴 |
| `packages` | 要處理哪些套件（不填就處理全部 require） |
| `excluded_packages` | 排除哪些套件 |
| `delete_vendor_directories` | 處理完刪掉 vendor 裡的原始目錄 |

## 執行

```bash
# 確認設定正確
mozart config

# 執行前綴化
mozart compose
```

執行後，`vendor-prefixed/` 目錄裡的程式碼全部改好了：

```php
// 原本
namespace GuzzleHttp;
use Psr\Http\Client\ClientInterface;

// 處理後
namespace MyPlugin\Dependencies\GuzzleHttp;
use MyPlugin\Dependencies\Psr\Http\Client\ClientInterface;
```

所有 `use` 陳述式、型別提示、`class_exists()` 的字串都一起改，不會有漏網之魚。

## 搭配 Composer scripts 自動化

```json
{
  "scripts": {
    "post-install-cmd": ["mozart compose"],
    "post-update-cmd": ["mozart compose"]
  }
}
```

這樣每次 `composer install` 或 `composer update` 之後，Mozart 自動執行。

## 在外掛裡使用

Mozart 處理完之後，你需要載入它產生的 autoloader，不再用原本 vendor 的版本：

```php
// plugin.php
require_once __DIR__ . '/vendor-prefixed/autoload.php';

// 之後正常用，但實際載入的是前綴過的版本
use MyPlugin\Dependencies\GuzzleHttp\Client;

$client = new Client();
```

## 沒有 namespace 的 class

有些舊套件沒有用 namespace，例如：

```php
// 原本
class Container { ... }
```

Mozart 把它改成：

```php
// 處理後
class MyPlugin_Container { ... }
```

所有呼叫 `new Container()` 的地方也一起改成 `new MyPlugin_Container()`。

## 限制

**不支援動態 class 名稱**：如果程式碼裡有這種寫法，Mozart 追蹤不到：

```php
$class = 'GuzzleHttp\\Client';
$obj = new $class();  // Mozart 不會改這裡
```

**Mozart 自身的依賴問題**：Mozart 本身也用了一些 library，如果 require 進專案可能跟你的依賴衝突，所以推薦用 Docker 或 PHAR 執行。

**維護狀態**：Mozart 還在維護（最新版 1.1.3），但社群已有不少人轉向 [Strauss](/p/strauss-composer-prefix/)，它是從 Mozart fork 出來的，解決了幾個 Mozart 的已知問題。

## 小結

WordPress 外掛的依賴衝突問題沒有官方解法，Mozart 是目前最直接的工具。核心概念簡單：把依賴複製一份，namespace 加前綴，讓它跟別人的版本完全不是同一個 class。

如果你遇到 Mozart 的限制（常數前綴、file autoloader 支援、license 合規），可以考慮 [Strauss](/p/strauss-composer-prefix/)，它在這幾個地方做了改進。

## 參考資源

- [Mozart GitHub 儲存庫](https://github.com/coenjacobs/mozart) — 原始碼與完整設定文件
- [Strauss：Mozart 的 fork 繼承者](https://github.com/BrianHenryIE/strauss) — 解決 Mozart 已知問題的替代方案
- [Composer 官方文件：extra 欄位](https://getcomposer.org/doc/04-schema.md#extra) — composer.json 的 extra 設定說明
- [WordPress 外掛開發：依賴管理最佳實踐](https://developer.wordpress.org/plugins/plugin-basics/best-practices/) — WordPress 官方外掛開發指引
