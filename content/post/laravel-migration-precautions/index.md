---
title: Laravel Migration 注意事項
description: 'Laravel migration 常見踩坑：新增和刪除欄位不能放同一個 closure，刪多個欄位要寫同一行，用 SQLite 測試驗證。'
slug: laravel-create-migration-precautions
date: '2020-06-08T22:18:27+08:00'
categories:
- Laravel
tags:
- Laravel
- Migration
draft: false
image: featured.png
---

## 前言

最近用 `migration:rollback` 的時候踩了不少坑。紀錄一下幾個容易出錯的寫法，以及怎麼用測試來提早抓出問題。

## 容易出錯的寫法

### 新增欄位和刪除欄位放在同一個 closure

```php
// Bad
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
    $table->string('new_column');
});

// Good — 拆成兩個 closure
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
});

Schema::table('users', function (Blueprint $table) {
    $table->string('new_column');
});
```

### 同時刪除索引和欄位

```php
// Bad
Schema::table('users', function (Blueprint $table) {
    $table->dropIndex('users_old_column_index');
    $table->dropColumn('old_column');
});

// Good — 先刪索引，再刪欄位
Schema::table('users', function (Blueprint $table) {
    $table->dropIndex('users_old_column_index');
});

Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
});
```

### 刪多個欄位要寫在同一行

```php
// Bad
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
    $table->dropColumn('old_column2');
});

// Good
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column', 'old_column2');
});
```

## 怎麼自動驗證 Migration

在正式資料庫上跑 `migration:rollback` 來測試太冒險了。比較安全的做法是用 PHPUnit + SQLite in-memory 來跑。

### 1. 設定 phpunit.xml

在 `<php>` 區塊加上這兩行：

```xml
<env name="DB_CONNECTION" value="sqlite"/>
<env name="DB_DATABASE" value=":memory:"/>
```

### 2. 寫一個測試

不用很複雜，只要確保 migration 能跑完就好：

```php
namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseMigrations;
use Tests\TestCase;

class MigrationTest extends TestCase
{
    use DatabaseMigrations;

    public function testMigrationRunsSuccessfully()
    {
        $this->assertTrue(true);
    }
}
```

跑 `vendor/bin/phpunit`，如果 migration 有問題會直接報錯。這樣每次改 migration 都能馬上知道有沒有寫壞。
