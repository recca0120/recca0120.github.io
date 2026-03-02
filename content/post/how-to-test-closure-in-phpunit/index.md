---
title: 'PHPUnit 測試 Closure：用 Mockery::spy 驗證 Callback'
description: '用 Mockery::spy 包裝 closure，解決在 closure 內寫 assertion 無法偵測「callback 根本沒被呼叫」的盲點，同時驗證參數和呼叫次數。'
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

當函式接受 callback 參數時，要怎麼在 PHPUnit 裡驗證 callback 確實被呼叫、參數正確、呼叫次數也對？

## 直覺的寫法有什麼問題

假設有這樣一個函式：

```php
function executeCallback(callable $fn): void
{
    $fn('foo');
}
```

最直覺的做法是在 closure 裡面寫 assertion：

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

這樣寫能驗參數，但如果 `executeCallback` 根本沒呼叫 `$callback`，測試也不會失敗，因為 assertion 根本沒被執行到。

## 用 [Mockery](https://github.com/mockery/mockery)::spy 對 Closure 做驗證

根據這個 [PR](https://github.com/mockery/mockery/pull/712)，Mockery 支援直接對 closure 做 spy：

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

這樣如果 callback 沒被呼叫，`shouldHaveBeenCalled()` 就會讓測試失敗。還可以進一步驗證呼叫次數：

```php
$callback->shouldHaveBeenCalled()->with('foo')->twice();
```

整個測試結構符合 3A pattern (Arrange-Act-Assert)，比在 closure 裡面塞 assertion 更好讀，也能正確偵測 callback 從未被呼叫的情況。
