---
title: 'PHPUnit: Mock sleep() in 2 Ways Without Waiting'
description: 'When sleep() slows PHPUnit tests, extract a Clock class and use Mockery spy to replace it, or use php-mock to mock the built-in function with no code changes.'
slug: phpunit-sleep
date: '2023-01-06T08:55:58+08:00'
categories:
- Testing
- PHP
tags:
- PHP
- PHPUnit
- Mockery
- Testing
image: featured.jpg
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

        // verify sleep was called the expected number of times
        $clock->shouldHaveReceived('sleep')->times(3);
    }
}
```

The advantage of this approach is that you can use the spy to verify how many times `sleep` was called.

## Approach 2: Mock the Built-in Function with php-mock

If you don't want to modify the original code, use [php-mock](https://github.com/php-mock/php-mock). The controller stays untouched — only the test changes:

```bash
composer require --dev php-mock/php-mock
```

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
        // namespace where sleep() is called
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

## References

- [php-mock GitHub Repository](https://github.com/php-mock/php-mock) — Library for mocking PHP built-in functions
- [Mockery Official Documentation](https://docs.mockery.io/en/latest/) — Complete guide to spy and mock objects
- [PHPUnit Official Documentation](https://phpunit.de/documentation.html) — PHPUnit testing framework reference
- [Laravel Docs: Service Container](https://laravel.com/docs/container) — How to swap container bindings in tests
