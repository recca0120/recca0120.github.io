---
title: 'Use Laravel Container bind to Inject Any Third-Party Package'
description: 'When a third-party class requires constructor parameters, Laravel cannot auto-resolve it. Register it via bind in a ServiceProvider to enable type-hint injection anywhere.'
slug: how-to-use-laravel-container-to-register-third-party-package
date: '2023-01-06T01:46:18+08:00'
categories:
- Laravel
- PHP
tags:
- Laravel
- PHP
- Composer
image: featured.png
draft: false
---

When a third-party class requires constructor parameters, Laravel's container can't auto-resolve it. Directly type-hinting it for injection will throw an error.

## Reproducing the Problem

Suppose there's a third-party `FakeApi` whose constructor requires a `$token`:

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

Type-hinting it directly in a route:

```php
// routes/web.php
Route::get('/', static function (FakeApi $api) {
    return $api->getToken();
});
```

The test will fail because the container doesn't know what value to pass for `$token`:

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

## Register It in a ServiceProvider

In `AppServiceProvider`, use `bind` to tell the container how to create the class:

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

Once you know this pattern, you don't need to look for Laravel-specific wrappers for third-party packages. It also makes Laravel version upgrades smoother since you won't be blocked by those wrapper packages.
