---
title: '[Laravel] How to fix Unknown database type enum requested'
slug: laravel-how-to-fix-unknown-database-type-enum-requested
date: '2022-12-13T06:16:19+08:00'
categories:
- Laravel
tags:
- Laravel
- Migration
- MySQL
image: featured.png
draft: false
---

執行 `artisan migration` 時遇到 `Unknown database type enum requested` 錯誤。

## 原因

Laravel 的 migration 底層使用 Doctrine DBAL，而 Doctrine DBAL 預設不認識 MySQL 的 `enum` 型別。需要手動把 `enum` 註冊為 Doctrine 認識的型別。

## 方法一：在 AppServiceProvider 註冊

在 `AppServiceProvider` 裡用 `Type::addType` 把 `enum` 註冊為 `StringType`：

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

        // 如果需要強制覆寫
        // Type::overrideType('enum', StringType::class);
    }
}
```

## 方法二：在 config/database.php 設定 (Laravel 8+)

Laravel 8 以後可以直接在設定檔中註冊，但只支援 `addType`，不支援 `overrideType`：

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

## 遇到 MySQL57Platform 的錯誤訊息

如果錯誤訊息是 `Unknown database type enum requested, Doctrine\DBAL\Platforms\MySQL57Platform may not support it.`，處理方式完全不同，要改用 `registerDoctrineTypeMapping`：

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

兩種錯誤訊息看起來很像，但解法完全不同，要注意區分。

## 可用的 Doctrine DBAL Type

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
