---
title: '3 Laravel Migration Pitfalls and How to Catch Them with SQLite'
description: 'Covers 3 common migration mistakes: mixing add/drop in one closure, dropping index and column together, and calling dropColumn twice. Includes SQLite in-memory test setup to catch errors early.'
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

## Introduction

I recently hit several pitfalls when using `migration:rollback`. Here are some common mistakes and how to catch them early with tests.

## Common Mistakes

### Adding and dropping columns in the same closure

```php
// Bad
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
    $table->string('new_column');
});

// Good — split into two closures
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
});

Schema::table('users', function (Blueprint $table) {
    $table->string('new_column');
});
```

### Dropping an index and column at the same time

```php
// Bad
Schema::table('users', function (Blueprint $table) {
    $table->dropIndex('users_old_column_index');
    $table->dropColumn('old_column');
});

// Good — drop the index first, then the column
Schema::table('users', function (Blueprint $table) {
    $table->dropIndex('users_old_column_index');
});

Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
});
```

### Dropping multiple columns must be in a single call

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

## How to Automatically Validate Migrations

Running `migration:rollback` on a production database to test is too risky. A safer approach is to use PHPUnit + SQLite in-memory.

### 1. Configure phpunit.xml

Add these two lines in the `<php>` block:

```xml
<env name="DB_CONNECTION" value="sqlite"/>
<env name="DB_DATABASE" value=":memory:"/>
```

### 2. Write a test

It doesn't need to be complex -- just make sure the migration runs without errors:

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

Run `vendor/bin/phpunit`. If any migration has a problem, it will fail immediately. This way you can catch broken migrations right away every time you make changes.
