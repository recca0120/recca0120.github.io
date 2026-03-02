---
title: 'Mock IteratorAggregate with Mockery to Fix foreach in Tests'
description: 'Mocking IteratorAggregate breaks foreach in PHPUnit. Return an ArrayObject from the mocked getIterator method to make foreach iterate over test data correctly.'
slug: how-to-use-mockery-to-mock-iteratoraggregate
date: '2022-11-25T03:41:39+08:00'
categories:
- Testing
- PHP
tags:
- Mockery
- PHPUnit
- PHP
- Testing
image: featured.png
draft: false
---

While developing Google Firebase-related code, I needed to mock `QuerySnapshot`, which implements `IteratorAggregate`. It wasn't immediately obvious how to make `foreach` work with [Mockery](https://github.com/mockery/mockery).

## What is IteratorAggregate

[IteratorAggregate](https://www.php.net/manual/en/class.iteratoraggregate.php) is a built-in PHP interface. By implementing it and providing a `getIterator()` method, an object becomes iterable with `foreach`:

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

## How to Mock It

Just mock `getIterator()` to return an `ArrayObject`:

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

Three things are all you need: the class implements `IteratorAggregate`, mock `getIterator`, and return an `ArrayObject`.
