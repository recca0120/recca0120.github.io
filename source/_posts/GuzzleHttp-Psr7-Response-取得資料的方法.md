title: GuzzleHttp Psr7 Response 取得網頁內容的注意事項
urlname: guzzlehttp-psr7-response-get-contents-notice
comments: true
tags: php
categories: php
author: recca0120
abbrlink: 31234
date: 2020-08-05 13:12:49
updated: 2020-08-05 13:12:49
keywords:
description:
---

使用 GuzzleHttp Psr7 Response 要取得 Response 的回傳內容方法有兩種

```php
// method 1
(string) $response->getBody();

// method 2
$response->getBody()->getContents();
```

取得的內容會一模一樣，但是同一個 method 執行兩次是有差異的

```php
// method 1
(string) $response->getBody(); // 正常回傳
(string) $response->getBody(); // 正常回傳

// method 2
$response->getBody()->getContents(); // 正常回傳
$response->getBody()->getContents(); // 空值
```

後來去查了一下原始碼發現，原來 __toString 會執行 seek(0)，自動將指標歸零，才能一直重覆執行啊

```php
// 部份程式碼
class Stream implements StreamInterface
{
    public function __toString()
    {
        try {
            // 就是這一行
            $this->seek(0);
            return (string) stream_get_contents($this->stream);
        } catch (\Exception $e) {
            return '';
        }
    }
}
```
