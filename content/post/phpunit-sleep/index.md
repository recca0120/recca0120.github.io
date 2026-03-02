---
title: 'PHPUnit 寫測試時遇到 sleep 時該怎麼辦？'
slug: phpunit-sleep
date: '2023-01-06T08:55:58+08:00'
categories:
- PHP
tags:
- PHPUnit
- PHP
image: featured.png
draft: false
---

程式裡有 `sleep()` 呼叫時，測試會跟著等，像下面這個 retry 邏輯，跑一次測試就要等 15 秒。

```php
// app/Http/Controllers/HomeController.php
namespace App\Http\Controllers;

class HomeController extends Controller
{
    public function index(): string
    {
        $tries = 3;
        while (true) {
            // do something
            sleep(5);

            $tries--;
            if ($tries <= 0) {
                break;
            }
        }

        return 'foo';
    }
}
```

## 方法一：抽出 Clock class 再用 mock 替換

把 `sleep` 包進一個 `Clock` class，測試時用 Mockery spy 替換掉。

```php
namespace App;

class Clock
{
    public function sleep(int $second): void
    {
        sleep($second);
    }
}
```

Controller 改成注入 `Clock`：

```php
// app/Http/Controllers/HomeController.php
namespace App\Http\Controllers;

use App\Clock;

class HomeController extends Controller
{
    public function index(Clock $clock): string
    {
        $tries = 3;
        while (true) {
            // do something
            $clock->sleep(5);

            $tries--;
            if ($tries <= 0) {
                break;
            }
        }

        return 'foo';
    }
}
```

測試用 `swap` 抽換：

```php
namespace Tests\Feature;

use App\Clock;
use Mockery as m;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_sleep(): void
    {
        $clock = m::spy(Clock::class);
        $this->swap(Clock::class, $clock);

        $this->get('/')
            ->assertOk()
            ->assertSee('foo');

        // 驗證 sleep 執行次數
        $clock->shouldHaveReceived('sleep')->times(3);
    }
}
```

這個做法的好處是可以用 spy 驗證 `sleep` 被呼叫了幾次。

## 方法二：用 php-mock 直接 mock 內建函式

如果不想改動原本的程式碼，可以用 [php-mock](https://github.com/php-mock/php-mock) 這個 package。Controller 完全不用動，只改測試：

```php
namespace Tests\Feature;

use phpmock\environment\SleepEnvironmentBuilder;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $builder = new SleepEnvironmentBuilder();
        // sleep 所在的 namespace
        $builder->addNamespace('App\Http\Controllers');
        $this->environment = $builder->build();
        $this->environment->enable();
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        $this->environment->disable();
    }

    public function test_sleep(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('foo');
    }
}
```

php-mock 有個限制：`sleep` 必須在某個 namespace 底下才能被 mock。如果 `sleep` 是在全域 namespace 呼叫的，這招就不管用了。
