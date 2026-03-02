---
title: 'How to use Mockery to mock IteratorAggregate'
slug: how-to-use-mockery-to-mock-iteratoraggregate
date: '2022-11-25T03:41:39+08:00'
categories:
- Testing
tags:
- Mockery
- PHP
image: featured.png
draft: false
---

在開發 Google Firebase 相關程式時，需要 mock `QuerySnapshot`，而它 implement 了 `IteratorAggregate`，直接 mock 會不知道怎麼讓 `foreach` 跑起來。

## IteratorAggregate 是什麼

[IteratorAggregate](https://www.php.net/manual/en/class.iteratoraggregate.php) 是 PHP 內建的 interface，只要 implement 它並實作 `getIterator()`，物件就可以用 `foreach` 迭代：

```php
class myData implements IteratorAggregate {
    public $property1 = "Public property one";
    public $property2 = "Public property two";
    public $property3 = "Public property three";

    public function __construct() {
        $this->property4 = "last property";
    }

    public function getIterator() {
        return new ArrayIterator($this);
    }
}

$obj = new myData;

foreach($obj as $key => $value) {
    var_dump($key, $value);
    echo "\n";
}
```

## Mock 的方式

只要 mock `getIterator()` 回傳 `ArrayObject` 就行了：

```php
use ArrayObject;
use IteratorAggregate;
use Mockery;
use PHPUnit\Framework\TestCase;

class IteratorAggregateTest extends TestCase
{
    public function test_mock_aggregate(): void
    {
        $iterator = Mockery::mock(IteratorAggregate::class);
        $iterator->allows('getIterator')
          ->andReturn(new ArrayObject(['foo', 'bar']));

        foreach ($iterator as $value) {
            echo $value."\n";
        }
    }
}
```

三個條件就夠了：class implement `IteratorAggregate`、mock `getIterator`、return `ArrayObject`。
