---
title: '利用 Mockery 的 Capturing Arguments 測亂數'
slug: mockery-capturing-arguments
date: '2022-11-22T14:21:07+08:00'
categories:
- Testing
tags:
- Mockery
- PHP
image: featured.png
draft: false
---

當方法內部會產生亂數，導致回傳值不固定時，要怎麼寫 assertion？

## 亂數讓測試無法預期結果

假設我們有一個 `RandomHash` class，它會先產生 1 到 10 的亂數再做 hash：

```php
class Hash
{
    public function make($data): string
    {
        return hash_hmac('sha256', $data, false);
    }
}

class RandomHash
{
    public function __construct(public Hash $hash)
    {
    }

    /**
     * @throws \Exception
     */
    public function hash(): string
    {
        $random = md5(random_int(1, 10));

        return $this->hash->make($random);
    }
}
```

因為 `random_int` 每次回傳的值都不同，`hash()` 的結果也跟著變，測試寫不出確定的 expected value：

```php
class RandomHashTest extends TestCase
{
    public function test_mockery_capturing_arguments(): void
    {
        $hash = new Hash();
        $randomHash = new RandomHash($hash);

        // 很難驗證是否正確
        $actual = $randomHash->hash();
    }
}
```

## 用 Mockery::capture 把中間值抓出來

Mockery 的 [Capturing Arguments](http://docs.mockery.io/en/latest/reference/argument_validation.html#capturing-arguments) 可以在方法被呼叫時，把傳入的參數存到變數裡。搭配 `passthru()` 讓原本的方法照常執行，我們就能同時拿到中間值和最終結果：

```php
class RandomHashTest extends TestCase
{
    /**
     * @throws \Exception
     */
    public function test_mockery_capturing_arguments(): void
    {
        $hash = Mockery::spy(new Hash());
        // 用 Mockery::capture 把 random 抓出來，passthru 讓 make 真的執行
        $hash->allows('make')->with(Mockery::capture($random))->passthru();
        $randomHash = new RandomHash($hash);

        $actual = $randomHash->hash();

        // 拿到 $random 後就能算出確定的 expected
        self::assertEquals((new Hash)->make($random), $actual);
    }
}
```

這樣即使內部有亂數，測試依然能寫出明確的 assertion。
