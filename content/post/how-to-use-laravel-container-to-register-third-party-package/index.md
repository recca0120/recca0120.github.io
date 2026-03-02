---
title: '用 Laravel Container bind 解決第三方套件無法自動注入'
description: '第三方 class 的 constructor 需要參數時，Laravel Container 無法自動 resolve。在 ServiceProvider 用 bind 註冊，任何地方都能 type-hint 注入，也不用找 Laravel 專屬封裝版。'
slug: how-to-use-laravel-container-to-register-third-party-package
date: '2023-01-06T01:46:18+08:00'
categories:
- Laravel
tags:
- Laravel
image: featured.png
draft: false
---

當第三方 class 的 constructor 需要參數時，Laravel 沒辦法自動 resolve，直接 type-hint 注入會報錯。

## 問題重現

假設有一個第三方的 `FakeApi`，constructor 需要一個 `$token`：

```php
// app/FakeApi.php
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

在 route 裡直接 type-hint 注入：

```php
// routes/web.php
Route::get('/', static function (FakeApi $api) {
    return $api->getToken();
});
```

跑測試會失敗，因為 Container 不知道 `$token` 要給什麼值：

```php
namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_inject_fake_api(): void
    {
        $this->get('/')->assertOk();
    }
}
```

## 在 ServiceProvider 註冊就好

到 `AppServiceProvider` 用 `bind` 告訴 Container 怎麼建立這個 class：

```php
// app/Providers/AppServiceProvider.php
namespace App\Providers;

use App\FakeApi;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->bind(FakeApi::class, fn() => new FakeApi('foo'));
    }
}
```

```php
namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_inject_fake_api(): void
    {
        $this->get('/')->assertOk()->assertSee('foo');
    }
}
```

知道這個用法後，就不必刻意去找專門為 Laravel 封裝的 third-party package 了。升級 Laravel 版本時也比較不會被這些 package 卡住。
