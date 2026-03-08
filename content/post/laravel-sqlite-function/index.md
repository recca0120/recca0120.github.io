---
title: '用 sqliteCreateFunction 讓 SQLite 支援 MySQL 專屬函式'
description: 'SQLite 測試遇到 MySQL 專屬 function 如 FIELD 會噴 no such function 錯誤，用 sqliteCreateFunction 自行補上即可。'
slug: laravel-sqlite-function
date: '2023-02-17T03:27:51+08:00'
categories:
- Laravel
- Database
tags:
- Laravel
- SQLite
- Testing
image: featured.jpg
draft: false
---

用 SQLite 跑測試時，遇到 MySQL 專屬的 function（像 `FIELD`）會直接噴 `no such function` 錯誤。

## 為什麼會出錯

每個資料庫內建的 function 不一樣，SQLite 沒有 MySQL 的 `FIELD` function。假設程式裡有這樣的查詢：

```php
Route::get('/', function() {
    return User::query()->orderByRaw('FIELD(id, 3, 5, 4, 1, 2)')->get();
});
```

用 MySQL 跑沒問題，但測試用 SQLite 就會失敗：

```php
namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_sql_function(): void
    {
        User::factory()->count(5)->create();

        $data = $this->get('/')->assertStatus(200)->collect();

        self::assertEquals([3, 5, 4, 1, 2], $data->pluck('id')->toArray());
    }
}
```

## 用 sqliteCreateFunction 自己補上

PHP 的 SQLite PDO 支援自定義 function，在 `TestCase` 的 `setUp` 裡加上就好：

```php
namespace Tests;

use Illuminate\Database\SQLiteConnection;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function setUp(): void
    {
        parent::setUp();
        $connection = DB::connection();
        if (is_a($connection, SQLiteConnection::class)) {
            $connection->getPdo()->sqliteCreateFunction(
                'FIELD',
                static fn($id, ...$array) => array_search($id, $array)
            );
        }
    }
}
```

這樣 SQLite 就能認得 `FIELD` function，測試正常通過。同樣的方式也可以補上其他 MySQL 專屬的 function。
