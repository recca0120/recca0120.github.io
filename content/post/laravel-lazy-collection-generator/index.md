---
title: 'Laravel LazyCollection 搭 Generator 為何延遲載入失效'
description: '直接把 Generator 傳給 LazyCollection 會被 iterator_to_array 一次全部展開，失去延遲載入效果，必須用 Closure 包一層才能正確運作。'
slug: lazy-collection-with-generator-notice
date: '2020-08-17T12:46:29+08:00'
categories:
- Laravel
tags:
- Laravel
draft: false
image: featured.png
---

## 以為會動的寫法

看文件知道 LazyCollection 搭 Generator 可以做到延遲載入，我就直接把 generator 丟進去，以為找到 `$i > 5` 之後迴圈就會停下來：

```php
$this->assertEquals(6, LazyCollection::make($this->generator())->collapse()->first(function ($i) {
    return $i > 5;
}));
```

結果不是。迴圈跑完了全部 9 輪才停。

## 為什麼

翻了 LazyCollection 的原始碼才搞懂。建構子收到的如果不是 `Closure`，就會走到 `getArrayableItems()`，而 Generator 實作了 `Traversable`，所以會被 `iterator_to_array()` 一口氣全部展開：

```php
protected function getArrayableItems($items)
{
    // ...
    } elseif ($items instanceof Traversable) {
        return iterator_to_array($items);
    }
    // ...
}
```

延遲載入的效果完全沒了。

## 正確寫法

用 Closure 包一層，讓 LazyCollection 拿到的是一個「能產生 Generator 的函式」，而不是已經開始跑的 Generator：

```php
$this->assertEquals(6, LazyCollection::make(function () {
    return $this->generator();
})->collapse()->first(function ($i) {
    return $i > 5;
}));
```

這樣只會執行第一輪迴圈就停了，才是真正的延遲載入。

文件要仔細看，一個包裝方式的差異就差這麼多。
