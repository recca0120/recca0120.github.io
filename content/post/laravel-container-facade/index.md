---
title: 'Laravel Facade 底層如何透過 Container 取 instance'
description: 'Facade 透過 getFacadeAccessor 從 Container 解析 instance 的機制，以及 bind 與 singleton 的差異。'
slug: laravel-container-facade
date: '2023-01-12T05:34:12+08:00'
categories:
- Laravel
- PHP
tags:
- Laravel
- PHP
image: featured.png
draft: false
---

延續[上一篇 Laravel Container](/post/how-to-use-laravel-container-to-register-third-party-package/)，這篇來看 Container 和 Facade 之間到底是什麼關係。

## bind vs singleton

先準備一個 `FakeApi` class：

```php
namespace App;

class FakeApi
{
    private string $token;

    public function __construct(string $token)
    {
        $this->token = $token;
    }

    public function getToken(): string
    {
        return $this->token;
    }
}
```

在 `AppServiceProvider` 用 `bind` 註冊，token 給隨機值：

```php
namespace App\Providers;

use App\FakeApi;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->bind(FakeApi::class, fn() => new FakeApi(Str::random()));
    }
}
```

寫個測試，從 Container 取兩次 `FakeApi` 比較 token：

```php
namespace Tests\Feature;

use App\FakeApi;
use Tests\TestCase;

class FacadeTest extends TestCase
{
    public function test_facade(): void
    {
        $fakeApi = app(FakeApi::class);
        $fakeApi2 = app(FakeApi::class);

        self::assertEquals($fakeApi->getToken(), $fakeApi2->getToken());
    }
}
```

測試會失敗，因為 `bind` 每次都會建立新的 instance。把 `bind` 改成 `singleton` 就好了：

```php
$this->app->singleton(FakeApi::class, fn() => new FakeApi(Str::random()));
```

## Facade 只是 Container 的代理

建立 `FakeApi` 的 Facade：

```php
namespace App\Facades;

use Illuminate\Support\Facades\Facade;

class FakeApi extends Facade
{
    protected static function getFacadeAccessor()
    {
        return \App\FakeApi::class;
    }
}
```

測試驗證 Facade 和直接從 Container 取出的是同一個 instance：

```php
namespace Tests\Feature;

use App\Facades\FakeApi as FakeApiFacade;
use App\FakeApi;
use Tests\TestCase;

class FacadeTest extends TestCase
{
    public function test_facade(): void
    {
        $fakeApi = app(FakeApi::class);

        self::assertEquals($fakeApi->getToken(), FakeApiFacade::getToken());
    }
}
```

Facade 就是透過 `getFacadeAccessor` 回傳的 key 去 Container 取 instance，再用 static method 轉呼叫 instance method。

## getFacadeAccessor 可以是任意字串

像 Laravel 內建的 `DB` Facade，`getFacadeAccessor` 回傳的是字串 `'db'` 而不是 class name：

```php
namespace Illuminate\Support\Facades;

class DB extends Facade
{
    protected static function getFacadeAccessor()
    {
        return 'db';
    }
}
```

我們也可以這樣做，在 Container 註冊一個別名：

```php
namespace App\Providers;

use App\FakeApi;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->singleton(FakeApi::class, fn() => new FakeApi(Str::random()));
        $this->app->singleton('fake-api', fn() => $this->app->make(FakeApi::class));
    }
}
```

```php
namespace App\Facades;

use Illuminate\Support\Facades\Facade;

class FakeApi extends Facade
{
    protected static function getFacadeAccessor()
    {
        return 'fake-api';
    }
}
```

Container 註冊的 key 本來就是字串（`FakeApi::class` 本質上也是字串），所以用 class name 或自訂字串都可以。

如果想找 Laravel 內建的某個 Facade 到底註冊在哪，用 grep 暴力搜就好：

```bash
grep -rnw ./vendor -e "\$this->app->\(singleton\|bind\)('db'"
```
