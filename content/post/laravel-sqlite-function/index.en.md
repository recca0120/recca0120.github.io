---
title: 'Add MySQL Functions to SQLite in Laravel Tests with sqliteCreateFunction'
description: 'SQLite throws "no such function" for MySQL-specific functions like FIELD. Use PDO sqliteCreateFunction in TestCase setUp to register them and make tests pass.'
slug: laravel-sqlite-function
date: '2023-02-17T03:27:51+08:00'
categories:
- Database
tags:
- SQLite
- Laravel
image: featured.png
draft: false
---

When running tests with SQLite, MySQL-specific functions like `FIELD` throw a `no such function` error.

## Why It Fails

Each database has different built-in functions. SQLite doesn't have MySQL's `FIELD` function. Suppose your code has this query:

```php
Route::get('/', function() {
    return User::query()->orderByRaw('FIELD(id, 3, 5, 4, 1, 2)')->get();
});
```

It works fine with MySQL, but tests using SQLite will fail:

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

## Add It with sqliteCreateFunction

PHP's SQLite PDO supports custom functions. Just add it in `TestCase`'s `setUp`:

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

Now SQLite recognizes the `FIELD` function and the test passes. You can use the same approach to add other MySQL-specific functions.
