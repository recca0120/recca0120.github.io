title: LazyCollection 加 Generate 踩雷記
urlname: lazy-collection-with-generator-notice
comments: true
tags:
  - laravel
  - lazy-collection
  - generator
categories: laravel
author: recca0120
abbrlink: 65259
date: 2020-08-17 12:46:29
updated: 2020-08-17 12:46:29
keywords:
description:
---
在看文件的時候就知道 LazyCollection 搭 Generator 是一個很棒的組合
就誤以為直接丟 generator 就可以當找到 $i > 5 之後就會停止執行迴圈
但事與願違啊

```php
use Illuminate\Support\LazyCollection;
use PHPUnit\Framework\TestCase;

class ExampleTest extends TestCase
{
    public function test_lazy_collect()
    {
        $this->assertEquals(6, LazyCollection::make($this->generator())->collapse()->first(function ($i) {
            var_dump($i);

            return $i > 5;
        }));
    }

    public function generator()
    {
        $x = 1;
        for ($i = 1; $i <= 9; $i++) {
            var_dump(sprintf('loop-%02d', $x));
            $temp = [];
            for ($j = 1; $j <= 9; $j++) {
                $temp[] = $i * $j;
            }
            $x++;
            yield $temp;
        }
    }
}

// 會跑完所有迴圈
// string(7) "loop-01"
// string(7) "loop-02"
// string(7) "loop-03"
// string(7) "loop-04"
// string(7) "loop-05"
// string(7) "loop-06"
// string(7) "loop-07"
// string(7) "loop-08"
// string(7) "loop-09"
// int(1)
// int(2)
// int(3)
// int(4)
// int(5)
// int(6)
```

查了一下原始碼必須用 Closure 來回傳 Generator

```php
class LazyCollection implements Enumerable
{
    public function __construct($source = null)
    {
        if ($source instanceof Closure || $source instanceof self) {
            $this->source = $source;
        } elseif (is_null($source)) {
            $this->source = static::empty();
        } else {
            $this->source = $this->getArrayableItems($source);
        }
    }
    
    /**
     * Results array of items from Collection or Arrayable.
     *
     * @param  mixed  $items
     * @return array
     */
    protected function getArrayableItems($items)
    {
        if (is_array($items)) {
            return $items;
        } elseif ($items instanceof Enumerable) {
            return $items->all();
        } elseif ($items instanceof Arrayable) {
            return $items->toArray();
        } elseif ($items instanceof Jsonable) {
            return json_decode($items->toJson(), true);
        } elseif ($items instanceof JsonSerializable) {
            return (array) $items->jsonSerialize();
        } elseif ($items instanceof Traversable) {
            // 不是用 Closure 就會跑到一段
            return iterator_to_array($items);
        }

        return (array) $items;
    }
}

```

所以正確的寫法應該是

```php
use Illuminate\Support\LazyCollection;
use PHPUnit\Framework\TestCase;

class ExampleTest extends TestCase
{
    public function test_lazy_collect()
    {
        // 必須使用 Closure
        $this->assertEquals(6, LazyCollection::make(function () {
            return $this->generator();
        })->collapse()->first(function ($i) {
            var_dump($i);

            return $i > 5;
        }));
    }

    public function generator()
    {
        $x = 1;
        for ($i = 1; $i <= 9; $i++) {
            var_dump(sprintf('loop-%02d', $x));
            $temp = [];
            for ($j = 1; $j <= 9; $j++) {
                $temp[] = $i * $j;
            }
            $x++;
            yield $temp;
        }
    }
}

// 只執行了第一行迴圈
string(7) "loop-01"
int(1)
int(2)
int(3)
int(4)
int(5)
int(6)
```

這告訴我們文件必須仔細看啊
