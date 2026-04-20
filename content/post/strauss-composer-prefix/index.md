---
title: 'Strauss：Mozart 的繼承者，WordPress 外掛依賴隔離的更好選擇'
date: '2026-04-05T09:00:00+08:00'
slug: strauss-composer-prefix
image: cover.jpg
description: 'Strauss 是從 Mozart fork 出來的 Composer 依賴前綴工具，解決了 Mozart 幾個已知問題：支援 files autoloader、常數前綴、license 合規、零設定開箱即用。WordPress 外掛開發的現代選擇。'
categories:
  - PHP
tags:
  - strauss
  - composer
  - wordpress
  - php
  - namespace
---

如果你看過 [Mozart]({{< ref "/post/mozart-composer-prefix" >}}) 的介紹，知道它在解決什麼問題：WordPress 外掛共用同一個 PHP process，不同外掛用同一個 library 的不同版本會炸，Mozart 把你的 vendor 依賴加上 namespace 前綴來隔離。

[Strauss](https://github.com/BrianHenryIE/strauss) 從 Mozart fork 出來，解決了幾個 Mozart 的已知限制，現在是社群更推薦的選擇。

## Strauss 改了什麼

| 問題 | Mozart | Strauss |
|---|---|---|
| `files` autoloader 支援 | 有限 | 完整支援 |
| 常數前綴（`define()`） | 不支援 | 支援 |
| 函式前綴 | 不支援 | v0.21.0 起支援 |
| License 合規 | 可能有問題 | 修改 header，保留 license 檔案 |
| 預設行為 | 可能刪原始檔案 | 非破壞性預設 |
| 零設定 | 需要設定 | 可以完全不設定 |
| 測試覆蓋率 | 有限 | 完整 PHPUnit 測試 |

## 安裝

### 推薦：PHAR 方式

```bash
mkdir bin && touch bin/.gitkeep
```

在 `.gitignore` 加上：

```
bin/strauss.phar
```

在 `composer.json` 加上 scripts：

```json
{
  "scripts": {
    "prefix-namespaces": [
      "sh -c 'test -f ./bin/strauss.phar || curl -o bin/strauss.phar -L -C - https://github.com/BrianHenryIE/strauss/releases/latest/download/strauss.phar'",
      "@php bin/strauss.phar",
      "@composer dump-autoload"
    ],
    "post-install-cmd": ["@prefix-namespaces"],
    "post-update-cmd": ["@prefix-namespaces"]
  }
}
```

第一次執行時自動下載 PHAR，之後直接用快取的。

### 或者 require 進專案

```bash
composer require --dev brianhenryie/strauss
```

## 設定

Strauss 可以完全不設定（零設定），它會從你的 `composer.json` 自動推斷 namespace 前綴和目標目錄。

需要自訂時，加在 `extra.strauss`：

```json
{
  "extra": {
    "strauss": {
      "target_directory": "vendor-prefixed",
      "namespace_prefix": "MyPlugin\\Vendor\\",
      "classmap_prefix": "MyPlugin_",
      "constant_prefix": "MYPLUGIN_",
      "packages": [
        "guzzlehttp/guzzle"
      ],
      "exclude_from_copy": {
        "packages": ["psr/container"],
        "namespaces": ["Psr\\Log\\"],
        "file_patterns": ["\\.md$"]
      },
      "exclude_from_prefix": {
        "namespaces": ["Psr\\"]
      }
    }
  }
}
```

| 選項 | 說明 |
|---|---|
| `target_directory` | 處理後的檔案放哪（預設 `vendor-prefixed`）|
| `namespace_prefix` | 加在 namespace 前面的前綴 |
| `classmap_prefix` | 沒有 namespace 的 class 前綴 |
| `constant_prefix` | `define()` 常數的前綴 |
| `exclude_from_copy` | 不要複製的套件、namespace、檔案 |
| `exclude_from_prefix` | 複製但不加前綴（例如 PSR 標準介面） |

## 執行

```bash
composer prefix-namespaces
```

或者直接：

```bash
php bin/strauss.phar
```

乾跑預覽（不實際修改檔案）：

```bash
php bin/strauss.phar --dry-run
```

## 常數前綴

Mozart 不支援 `define()` 的前綴，Strauss 支援：

```php
// 你的依賴裡有
define('GUZZLE_VERSION', '7.0');

// Strauss 改成
define('MYPLUGIN_GUZZLE_VERSION', '7.0');
```

常數也是全域的，跟 class 一樣會衝突，這個功能對某些套件很重要。

## files autoloader 支援

有些套件用 `files` autoloader（不是 PSR-4，直接 require 檔案），Mozart 對這種支援有限，Strauss 完整處理：

```json
// 套件的 composer.json
"autoload": {
    "files": ["src/functions.php"]
}
```

Strauss 會複製並前綴化這些檔案，確保不漏掉。

## 在外掛裡載入

```php
// plugin.php
require_once __DIR__ . '/vendor-prefixed/autoload.php';

use MyPlugin\Vendor\GuzzleHttp\Client;

$client = new Client();
```

或者讓 Strauss 把 autoloader 注入進 `vendor/autoload.php`：

```bash
php bin/strauss.phar include-autoloader
```

這樣只需要 `require vendor/autoload.php`，不需要另外 require `vendor-prefixed/autoload.php`。

## License 合規

Strauss 在修改的每個檔案 header 加上注記，並保留原始 license 檔案。Mozart 這一塊有疑慮，開源 license 通常要求保留原始聲明，Strauss 直接處理這個問題。

## 跟 Mozart 設定相容

如果你原本用 Mozart，Strauss 可以直接讀 Mozart 的 `extra.mozart` 設定，不需要馬上改：

```json
{
  "extra": {
    "mozart": {
      "dep_namespace": "MyPlugin\\Dependencies\\"
    }
  }
}
```

Strauss 會自動識別並套用。

## 應該選 Mozart 還是 Strauss？

如果是新專案，直接用 Strauss。

如果已經在用 Mozart，遇到以下情況可以考慮遷移：
- 你的依賴用了 `files` autoloader
- 需要 `define()` 常數前綴
- 對 license 合規有要求
- 需要函式前綴（v0.21.0+）

遷移成本不高，Strauss 讀得懂 Mozart 設定，改幾行 scripts 就切換過去了。

## 小結

Strauss 跟 Mozart 解決同一個問題：WordPress 外掛的依賴衝突。差別在細節：更完整的 autoloader 支援、常數前綴、license 合規、更保守的預設值。

新外掛直接選 Strauss，舊外掛有痛點再考慮遷移。

## 參考資源

- [Strauss GitHub 官方倉庫](https://github.com/BrianHenryIE/strauss)
- [Composer 官方文件](https://getcomposer.org/doc/)
- [WordPress 外掛依賴管理最佳實踐](https://developer.wordpress.org/plugins/plugin-basics/)
- [Mozart GitHub 倉庫（Strauss 的前身）](https://github.com/coenjacobs/mozart)
