title: Laravel Migration 注意事項
urlname: laravel-create-migration-precautions
comments: true
tags:
  - laravel
categories:
  - laravel
author: recca0120
abbrlink: 3083
keywords:
  - laravel - migration
date: 2020-06-08 22:18:27
updated: 2020-06-08 22:18:27
description:
---
最近使用 Migration 的 Rollback 發生了不少問題，要避免以下幾種寫法

#### 新增欄位和刪除欄位共用

```php
// Bad
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
    $table->string('new_column');
});

// Good
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
});

Schema::table('users', function (Blueprint $table) {
    $table->string('new_column');
});
```

#### 同時刪除欄位及索引

```php
// Bad
Schema::table('users', function (Blueprint $table) {
    $table->dropIndex('users_old_column_index');
    $table->dropColumn('old_column');
});

// Good
Schema::table('users', function (Blueprint $table) {
    $table->dropIndex('users_old_column_index');
});

Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('old_column');
});
```

#### 刪除多欄位時要寫在一起

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

### 有沒有避免 migration 錯誤的方法？

大部份應該都是使用 php artisan migration:rollback 來測 migration 是否正確，但資料庫裡如果有資料可能就不會那麼有勇氣的下這一個指令了
所以最好的測試方法，當然是用 PHPUnit + sqlite 的方案了，最大的好處是根本不用擔心資料庫的資料了，所以我們只要設定幾個東西即可


1. 設定 phpunit.xml 的資料庫為 sqlite

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit backupGlobals="false"
         backupStaticAttributes="false"
         bootstrap="vendor/autoload.php"
         colors="true"
         convertErrorsToExceptions="true"
         convertNoticesToExceptions="true"
         convertWarningsToExceptions="true"
         processIsolation="false"
         stopOnFailure="false">
    <testsuites>
        <testsuite name="Feature">
            <directory suffix="Test.php">./tests/Feature</directory>
        </testsuite>

        <testsuite name="Unit">
            <directory suffix="Test.php">./tests/Unit</directory>
        </testsuite>
    </testsuites>
    <filter>
        <whitelist processUncoveredFilesFromWhitelist="true">
            <directory suffix=".php">./app</directory>
        </whitelist>
    </filter>
    <php>
        <env name="APP_ENV" value="testing"/>
        <env name="BCRYPT_ROUNDS" value="4"/>
        <env name="CACHE_DRIVER" value="array"/>
        <env name="SESSION_DRIVER" value="array"/>
        <env name="QUEUE_DRIVER" value="sync"/>
        <env name="MAIL_DRIVER" value="array"/>
        <!-- 這兩行 -->
        <env name="DB_CONNECTION" value="sqlite"/>
        <env name="DB_DATABASE" value=":memory:"/>
    </php>
</phpunit>
```

2. 寫個整合測試(不用擔心不會寫測試，照抄即可)

```php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseMigrations;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    // 加入這一行即可
    use DatabaseMigrations;
    
    /**
     * A basic test example.
     *
     * @return void
     */
    public function testBasicTest()
    {
        $this->assertTrue(true);
    }
}
```

最後只需執行 `vendor/bin/phpunit` 就可以讓 phpunit 幫忙做檢查了