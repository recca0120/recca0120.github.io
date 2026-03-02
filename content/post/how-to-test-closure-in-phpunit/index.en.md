---
title: 'PHPUnit: Test Closures with Mockery::spy'
description: 'Assertions inside a closure pass silently even if never called. Wrap the closure in Mockery::spy to verify invocation count and arguments in PHPUnit tests.'
slug: how-to-test-closure-in-phpunit
date: '2022-11-26T09:31:24+08:00'
categories:
- Testing
- PHP
tags:
- PHPUnit
- Mockery
- PHP
- Testing
image: featured.png
draft: false
---

When a function accepts a callback parameter, how do you verify in PHPUnit that the callback was actually called, with the correct arguments and the right number of times?

## What's Wrong with the Naive Approach

Given this function:

```php
function executeCallback(callable $fn): void
{
    $fn('foo');
}
```

The most intuitive approach is to put assertions inside the closure:

```php
class ExampleTest extends TestCase
{
    public function test_closure(): void
    {
        $callback = function (string $input) {
            self::assertEquals('foo', $input);
        };
        executeCallback($callback);
    }
}
```

This verifies the argument, but if `executeCallback` never calls `$callback`, the test still passes because the assertion is never executed.

## Using [Mockery](https://github.com/mockery/mockery)::spy to Verify Closures

According to this [PR](https://github.com/mockery/mockery/pull/712), Mockery supports spying on closures directly:

```bash
composer require --dev mockery/mockery
```

```php
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use PHPUnit\Framework\TestCase;

class ExampleTest extends TestCase
{
    use MockeryPHPUnitIntegration;

    public function test_closure(): void
    {
        /** @var \Mockery\Mock|callable $callback */
        $callback = Mockery::spy(function() {
        });

        executeCallback($callback);

        $callback->shouldHaveBeenCalled()->with('foo');
    }
}
```

If the callback is never called, `shouldHaveBeenCalled()` will fail the test. You can also verify the call count:

```php
$callback->shouldHaveBeenCalled()->with('foo')->twice();
```

The test structure follows the 3A pattern (Arrange-Act-Assert), which is more readable than embedding assertions inside the closure -- and correctly catches the case where the callback is never called at all.
