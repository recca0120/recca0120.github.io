---
title: 'Laravel 10 Database Expression'
slug: laravel-10-database-expression
date: '2023-02-20T05:41:20+08:00'
categories:
- Laravel
tags:
- Laravel
- MySQL
- SQLite
image: featured.png
draft: false
---

MySQL and SQLite often use different function names for the same functionality -- for example, MySQL's `IF()` requires `CASE WHEN` in SQLite. Laravel 10's new Database Expression feature handles this elegantly.

## The Old Way: Checking the Database Driver with when

MySQL's `IF` throws `no such function` on SQLite, so you'd have to write:

```php
namespace Tests\Feature;

use Illuminate\Database\MySqlConnection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_expression(): void
    {
        $isMySQL = is_a(DB::connection(), MySqlConnection::class);

        $result = DB::query()
            ->when($isMySQL, function ($query) {
                return $query->selectRaw('IF(10 > 1, 1, 0) AS value');
            })
            ->when(! $isMySQL, function ($query) {
                return $query->selectRaw('CASE WHEN 10 > 1 THEN 1 ELSE 0 END AS value');
            })
            ->first();

        self::assertEquals(1, $result->value);
    }
}
```

It works, but the code is verbose and messy.

## Using Expression to Encapsulate Cross-Database Differences

Laravel 10's `Expression` interface has a `getValue(Grammar $grammar)` method that generates the appropriate SQL based on the Grammar type. As described in this [PR](https://github.com/laravel/framework/pull/44784), this is exactly its intended purpose:

```php
namespace Tests\Feature;

use Illuminate\Contracts\Database\Query\Expression;
use Illuminate\Database\Grammar;
use Illuminate\Database\Query\Grammars\SQLiteGrammar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_expression(): void
    {
        $result = DB::query()
            ->select(new IfExpression('value', '10 > 1', 1, 0))
            ->first();

        self::assertEquals(1, $result->value);
    }
}

class IfExpression implements Expression
{
    public function __construct(
        private readonly string $alias,
        private readonly string $condition,
        private readonly mixed $true,
        private readonly mixed $false
    ) {
    }

    public function getValue(Grammar $grammar)
    {
        return match (get_class($grammar)) {
            SQLiteGrammar::class => "CASE WHEN $this->condition THEN $this->true ELSE $this->false END AS $this->alias",
            default => "IF($this->condition, $this->true, $this->false) AS $this->alias",
        };
    }
}
```

By encapsulating cross-database differences inside an Expression class, the calling code only needs `new IfExpression(...)`. The code is much cleaner and more reusable.
