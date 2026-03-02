---
title: 'Testing Random Values with Mockery Capturing Arguments'
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

How do you write assertions when a method internally generates a random value, making the return value unpredictable?

## Random Values Make Tests Unpredictable

Suppose we have a `RandomHash` class that generates a random number between 1 and 10, then hashes it:

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

Since `random_int` returns a different value each time, the result of `hash()` changes too, making it impossible to write a definitive expected value:

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

## Use Mockery::capture to Extract the Intermediate Value

Mockery's [Capturing Arguments](http://docs.mockery.io/en/latest/reference/argument_validation.html#capturing-arguments) can store the arguments passed to a method call. Combined with `passthru()` to let the original method execute normally, we can capture both the intermediate value and the final result:

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

This way, even with internal randomness, the test can still make a definitive assertion.
