---
title: 'GuzzleHttp getContents() 第二次回傳空字串的原因'
description: 'GuzzleHttp Response 用 (string) 轉換每次都自動 seek(0)，但 getContents() 不會重置指標，第二次呼叫只拿到空字串，需手動 rewind。'
slug: guzzlehttp-psr7-response-get-contents-notice
date: '2020-08-05T13:12:49+08:00'
categories:
- PHP
tags:
- Guzzle
- PSR-7
- PHP
draft: false
image: featured.png
---

## 兩種取法

用 [GuzzleHttp PSR-7](https://github.com/guzzle/psr7) 拿到 Response 後，有兩種方式取得內容：

```php
// 方法一：轉字串
(string) $response->getBody();

// 方法二：getContents()
$response->getBody()->getContents();
```

第一次呼叫時結果一樣。但連續呼叫兩次就不一樣了。

## 差異

```php
// 方法一：兩次都有值
(string) $response->getBody(); // 有內容
(string) $response->getBody(); // 有內容

// 方法二：第二次變空的
$response->getBody()->getContents(); // 有內容
$response->getBody()->getContents(); // 空字串
```

## 原因

看了原始碼就懂了。`__toString` 裡面會先呼叫 `seek(0)` 把讀取指標歸零，所以每次轉字串都能讀到完整內容：

```php
class Stream implements StreamInterface
{
    public function __toString()
    {
        try {
            $this->seek(0); // 指標歸零
            return (string) stream_get_contents($this->stream);
        } catch (\Exception $e) {
            return '';
        }
    }
}
```

而 `getContents()` 不會歸零，它從目前指標的位置往後讀。第一次讀完指標已經到底了，第二次自然讀不到東西。

如果要用 `getContents()` 又想重複讀取，記得先手動 `$response->getBody()->rewind()`。
