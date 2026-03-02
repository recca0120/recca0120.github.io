---
title: 'Laravel Migration 3 個常見踩坑與 SQLite 自動驗證'
description: '整理 migration rollback 常出錯的 3 種寫法：closure 混用、索引與欄位同時刪、多次 dropColumn，並用 SQLite in-memory 測試提前攔截。'
slug: laravel-create-migration-precautions
date: '2020-06-08T22:18:27+08:00'
categories:
- Laravel
- Database
tags:
- Laravel
- Migration
- SQLite
draft: false
image: featured.png
---

最近用 `migration:rollback` 的時候踩了不少坑，整理幾個容易出錯的寫法，以及怎麼用測試提早攔截。

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
