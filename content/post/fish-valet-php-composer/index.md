---
title: 'Fish Shell + Laravel Valet：自動切換 PHP 版本和 Composer v1/v2'
date: '2026-03-20T09:00:00+08:00'
slug: fish-valet-php-composer
description: '用 fish shell alias 和 function 讓 php、composer、phpunit 自動跟著 Laravel Valet 的 PHP 版本走。解決舊專案需要 Composer v1 的問題，智慧判斷用 composer.phar 還是系統 composer。'
categories:
  - PHP
  - Tools
tags:
  - fish
  - laravel
  - valet
  - php
  - composer
  - shell
  - version-manager
---

用 Laravel Valet 管多個 PHP 版本，每個專案設定不同版本，進到目錄 `php -v` 卻還是跑全域的版本。
舊專案需要 Composer v1，裝了 v2 卻裝不起來。
幾行 fish 設定解決，`php`、`composer`、`phpunit` 全部跟著 Valet 走。

## 問題

Valet 用 `valet php` 執行 PHP 指令時會自動切換到該目錄設定的版本，但直接打 `php` 用的是系統全域的 PHP，跟 Valet 沒關係。

Composer 更麻煩：有些舊 package 不相容 Composer v2，要用 v1 才能 `install`。不可能為了一個舊專案降版整個系統的 Composer，所以要在專案裡放一個 `composer.phar`（v1），但每次還要記得用 `php ./composer.phar` 執行，很煩。

## fish 設定

把以下內容加到 `~/.config/fish/config.fish`：

```fish
# php 直接用 valet 的版本，自動依目錄切換
alias php "valet php"

# phpunit 跟著 valet 的 php 走
alias phpunit "php vendor/bin/phpunit"

# composer：智慧判斷用 v1 還是 v2
function composer
    if [ -n "./composer.phar" ]
        # 專案目錄有 composer.phar（v1）→ 用它，順便解除記憶體限制
        COMPOSER_MEMORY_LIMIT=-1 valet php ./composer.phar $argv
    else
        # 沒有 composer.phar → 用系統的 valet composer
        valet composer $argv
    end
end
```

改完執行 `source ~/.config/fish/config.fish` 或重開 terminal 生效。

## 各行說明

### `alias php "valet php"`

`valet php` 會根據目前目錄的 `.valetphprc` 或 Valet 的目錄設定，選擇對應的 PHP 版本執行。設成 alias 之後，打 `php artisan`、`php -v` 都自動用正確版本，不用記得換。

### `alias phpunit "php vendor/bin/phpunit"`

phpunit 本身是 PHP script，用哪個 PHP 跑就很重要。這個 alias 確保 phpunit 用的是 `php`（也就是 `valet php`），跟專案的 PHP 版本一致。

### `function composer`

這個 function 解決 Composer v1/v2 共存的問題：

```fish
function composer
    if [ -n "./composer.phar" ]
        COMPOSER_MEMORY_LIMIT=-1 valet php ./composer.phar $argv
    else
        valet composer $argv
    end
end
```

`[ -n "./composer.phar" ]` 判斷目前目錄有沒有 `composer.phar`。有就用它（v1），沒有就用系統的 `valet composer`（v2）。

`COMPOSER_MEMORY_LIMIT=-1` 是因為 Composer v1 在安裝複雜依賴時很容易記憶體不足，設成 `-1` 讓它無限制使用。v2 效率好很多，通常不需要。

`$argv` 把所有傳入的參數轉給 composer，所以 `composer install`、`composer require laravel/framework` 這些都正常運作。

## 舊專案的 Composer v1 設定

遇到需要 v1 的舊專案，在專案根目錄下載 `composer.phar`：

```bash
# 下載最新的 Composer v1
curl -o composer.phar https://getcomposer.org/download/latest-1.x/composer.phar
chmod +x composer.phar

# 加到 .gitignore，不要 commit 進去
echo "composer.phar" >> .gitignore
```

之後進到這個目錄，`composer install` 就會自動用 v1 執行。其他專案沒有 `composer.phar`，繼續用 v2，互不干擾。

## 確認設定正確

```bash
# 確認 php 跟著 valet 走
php -v
# 應該顯示該目錄設定的 PHP 版本

# 確認 composer function 有效
type composer
# 輸出：composer is a function with definition ...

# 進到有 composer.phar 的目錄
cd ~/Sites/legacy-project
composer --version
# 輸出：Composer version 1.x.x

# 進到普通目錄
cd ~/Sites/modern-project
composer --version
# 輸出：Composer version 2.x.x
```

## 小結

這組設定的核心邏輯：讓開發工具跟著 Valet 的 PHP 版本走，不要自己手動切換。`php` 和 `phpunit` 用 alias 直接解決，`composer` 因為有 v1/v2 共存的需求，用 function 加一層判斷。

專案根目錄放 `composer.phar` 當作「這個專案要用 v1」的旗標，乾淨又直覺，不需要額外的設定檔。
