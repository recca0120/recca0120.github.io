---
title: 'How I Made Laravel Tests 7x Faster with PDO::exec Schema Load'
description: 'Load schema dump directly into SQLite in-memory database via PDO::exec, bypassing the slow per-file migration bottleneck. Test time drops from 2:21 to 18 seconds.'
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

As migration files pile up, test speed keeps getting slower -- even with SQLite In-Memory Database, because migrations run one file at a time.

## schema:dump Doesn't Support In-Memory Database

Laravel 8 introduced `php artisan schema:dump`, which merges all migrations into a single SQL file. However, after checking the [source code](https://github.com/laravel/framework/blob/b9203fca96960ef9cd8860cb4ec99d1279353a8d/src/Illuminate/Database/Schema/SqliteSchemaState.php#L62-L68), SQLite In-Memory Database doesn't support this command.

Some people online suggest using `DB::unprepared(file_get_contents("path/file.sql"))` to load it manually. It works but is actually slower.

## Load Schema Directly with PDO::exec

The key is to use PDO's `exec` instead of `DB::unprepared`:

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
        // Must run before parent::setUpTraits
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

In practice, this reduced test time from 2:21.979s to 18.457s -- 7x faster.

## Extract Into a Reusable Trait

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
        // Must run before parent::setUpTraits
        $this->loadSchemaToInMemoryDatabase();

        parent::setUpTraits();
    }
}
```
