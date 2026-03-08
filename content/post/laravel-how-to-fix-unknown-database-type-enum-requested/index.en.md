---
title: 'Fix Laravel Migration Unknown Database Type Enum Error'
description: 'Doctrine DBAL does not recognize MySQL enum type, causing migration failures. Covers Type::addType and registerDoctrineTypeMapping with when to use each fix.'
slug: laravel-how-to-fix-unknown-database-type-enum-requested
date: '2022-12-13T06:16:19+08:00'
categories:
- Laravel
- Database
tags:
- Laravel
- Migration
- MySQL
image: featured.jpg
draft: false
---

When running `artisan migration`, you encounter the `Unknown database type enum requested` error.

## Cause

Laravel's migration uses Doctrine DBAL under the hood, and Doctrine DBAL doesn't recognize MySQL's `enum` type by default. You need to manually register `enum` as a type that Doctrine understands.

## Method 1: Register in AppServiceProvider

Use `Type::addType` in `AppServiceProvider` to register `enum` as `StringType`:

```php
// app/Providers/AppServiceProvider.php
namespace App\Providers;

use Doctrine\DBAL\Types\StringType;
use Doctrine\DBAL\Types\Type;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register()
    {
        if (!Type::hasType('enum')) {
            Type::addType('enum', StringType::class);
        }

        // If you need to force override
        // Type::overrideType('enum', StringType::class);
    }
}
```

## Method 2: Configure in config/database.php (Laravel 8+)

Since Laravel 8, you can register it directly in the config file, but this only supports `addType`, not `overrideType`:

```php
// config/database.php
return [
    'dbal' => [
        'types' => [
            'enum' => Doctrine\DBAL\Types\StringType::class
        ]
    ]
];
```

## When You See the MySQL57Platform Error

If the error message is `Unknown database type enum requested, Doctrine\DBAL\Platforms\MySQL57Platform may not support it.`, the fix is completely different. Use `registerDoctrineTypeMapping` instead:

```php
// app/Providers/AppServiceProvider.php
namespace App\Providers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register()
    {
        if ($this->app->runningInConsole()) {
            /** @var AbstractPlatform $platform */
            $platform = DB::connection()
                ->getDoctrineConnection()
                ->getDatabasePlatform();

            if (!$platform->hasDoctrineTypeMappingFor('enum')) {
                $platform->registerDoctrineTypeMapping('enum', 'string');
            }
        }
    }
}
```

The two error messages look very similar, but the fixes are completely different. Pay attention to which one you're seeing.

## Available Doctrine DBAL Types

```php
Doctrine\DBAL\Types\ArrayType::class
Doctrine\DBAL\Types\AsciiStringType::class
Doctrine\DBAL\Types\BigIntType::class
Doctrine\DBAL\Types\BinaryType::class
Doctrine\DBAL\Types\BlobType::class
Doctrine\DBAL\Types\BooleanType::class
Doctrine\DBAL\Types\DateType::class
Doctrine\DBAL\Types\DateImmutableType::class
Doctrine\DBAL\Types\DateIntervalType::class
Doctrine\DBAL\Types\DateTimeType::class
Doctrine\DBAL\Types\DateTimeImmutableType::class
Doctrine\DBAL\Types\DateTimeTzType::class
Doctrine\DBAL\Types\DateTimeTzImmutableType::class
Doctrine\DBAL\Types\DecimalType::class
Doctrine\DBAL\Types\FloatType::class
Doctrine\DBAL\Types\GuidType::class
Doctrine\DBAL\Types\IntegerType::class
Doctrine\DBAL\Types\JsonType::class
Doctrine\DBAL\Types\ObjectType::class
Doctrine\DBAL\Types\SimpleArrayType::class
Doctrine\DBAL\Types\SmallIntType::class
Doctrine\DBAL\Types\StringType::class
Doctrine\DBAL\Types\TextType::class
Doctrine\DBAL\Types\TimeType::class
Doctrine\DBAL\Types\TimeImmutableType::class
```
