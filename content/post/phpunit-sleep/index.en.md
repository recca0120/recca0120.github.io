---
title: 'How to Handle sleep() in PHPUnit Tests'
description: 'Avoid slow tests caused by sleep() by extracting a Clock class for mocking, or use php-mock to mock the built-in sleep function.'
slug: phpunit-sleep
date: '2023-01-06T08:55:58+08:00'
categories:
- Testing
tags:
- PHPUnit
- PHP
image: featured.png
draft: false
---

When your code contains `sleep()` calls, tests have to wait too. For example, this retry logic makes each test run take 15 seconds:

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

## Approach 1: Extract a Clock Class and Mock It

Wrap `sleep` in a `Clock` class and replace it with a Mockery spy in tests.

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

Inject `Clock` into the controller:

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

Swap it in the test:

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

The advantage of this approach is that you can use the spy to verify how many times `sleep` was called.

## Approach 2: Mock the Built-in Function with php-mock

If you don't want to modify the original code, use [php-mock](https://github.com/php-mock/php-mock). The controller stays untouched — only the test changes:

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

php-mock has a limitation: `sleep` must be called within a namespace to be mockable. If `sleep` is called in the global namespace, this approach won't work.
