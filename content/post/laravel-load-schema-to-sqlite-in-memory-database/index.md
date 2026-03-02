---
title: '[Laravel] load schema to sqlite in memory database'
description: '用 PDO::exec 載入 schema dump 到 SQLite in-memory database，測試速度從 2 分多鐘降到 18 秒。'
slug: laravel-load-schema-to-sqlite-in-memory-database
date: '2022-12-19T15:26:54+08:00'
categories:
- Testing
tags:
- Laravel
- SQLite
- Testing
image: featured.png
draft: false
---

隨著 migration 檔案越來越多，測試速度越來越慢，即使用 SQLite In-Memory Database 也一樣，因為 migration 是一個檔案一個檔案跑的。

## schema:dump 不支援 In-Memory Database

Laravel 8 提供了 `php artisan schema:dump` 指令，能把所有 migration 合併成一個 SQL 檔案。但查看[原始碼](https://github.com/laravel/framework/blob/b9203fca96960ef9cd8860cb4ec99d1279353a8d/src/Illuminate/Database/Schema/SqliteSchemaState.php#L62-L68)後發現，SQLite In-Memory Database 不支援這個指令。

網路上有人建議用 `DB::unprepared(file_get_contents("path/file.sql"))` 手動載入，實測可行但速度反而更慢。

## 用 PDO::exec 直接載入 schema

關鍵是改用 PDO 的 `exec` 而不是 `DB::unprepared`：

```php
namespace Tests;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function setUpTraits()
    {
        // 必須在 parent::setUpTraits 之前
        $uses = array_flip(class_uses_recursive(static::class));
        $schema = database_path('schema/sqlite-schema.dump');
        if (isset($uses[RefreshDatabase::class]) &&
            $this->usingInMemoryDatabase() &&
            File::exists($schema)
        ) {
            DB::connection()->getPdo()->exec(File::get($schema));
        }

        parent::setUpTraits();
    }
}
```

實測從 2:21.979 秒降到 18.457 秒，快了 7 倍。

## 抽成可重用的 Trait

```php
namespace Tests\Traits;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

trait RefreshInMemoryDatabase
{
    public function loadSchemaToInMemoryDatabase(): array
    {
        $uses = array_flip(class_uses_recursive(static::class));
        $schema = database_path('schema/sqlite-schema.dump');
        if (isset($uses[RefreshDatabase::class]) &&
            $this->usingInMemoryDatabase() &&
            File::exists($schema)
        ) {
            DB::connection()->getPdo()->exec(File::get($schema));
        }

        return $uses;
    }
}
```

```php
namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Traits\RefreshInMemoryDatabase;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;
    use RefreshInMemoryDatabase;

    protected function setUpTraits()
    {
        // 必須在 parent::setUpTraits 之前
        $this->loadSchemaToInMemoryDatabase();

        parent::setUpTraits();
    }
}
```
