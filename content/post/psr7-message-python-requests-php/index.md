---
title: '使用 PSR7 message 將 python requests 結果回傳至 PHP'
slug: psr7-message-python-requests-php
date: '2022-12-26T06:34:26+08:00'
categories:
- PSR-7
- PHP
tags:
- PSR-7
- PHP
image: featured.png
draft: false
---

有時候 Python 已經有現成好用的 package 可以抓取網頁資訊，但後續處理都在 PHP 端。問題是怎麼把 Python requests 的 response 完整帶回 PHP？

## 為什麼用 PSR7 message 格式

HTTP message 本身就是純文字協定，PSR7 定義了標準的 message interface。只要 Python 端把 response 輸出成 HTTP message 格式的字串，PHP 端用 `GuzzleHttp\Psr7\Message::parseResponse` 就能直接解析回 `ResponseInterface`，不需要自己拆 header 和 body。

## Python 端：將 requests response 轉成 PSR7 message

```python
import argparse
from urllib.parse import urlparse

import requests
from requests import Response, PreparedRequest

parser = argparse.ArgumentParser()
parser.add_argument("url")
args = parser.parse_args()

def has_header(headers, key: str, value: str = None):
    for (k, v) in headers:
        if k.lower() == key.lower() and (value is None or v.lower() == value.lower()):
            return True
    return False

def psr7_message(message: PreparedRequest or Response) -> bytes:
    msg = ""
    body = bytes()
    if isinstance(message, PreparedRequest) is True:
        msg = "%s %s HTTP/1.1" % (message.method, message.url)
        body = message.body if message.body else bytes()
        if "host" in map(lambda header: str(header[0]).strip().lower(), message.headers):
            msg += "\r\nHost:" + urlparse(str(message.url)).hostname

    if isinstance(message, Response) is True:
        msg = "HTTP/1.1 %s %s" % (message.status_code, message.reason)
        body = message.content

    headers = message.headers.items()

    headers = filter(lambda header: has_header([header], "Transfer-Encoding", "chunked") is False, headers)
    headers = filter(lambda header: has_header([header], "Content-Encoding") is False, headers)
    headers = sorted(list(headers))

    msg += "".join(["\r\n%s: %s" % (name, value) for name, value in headers])

    return ("%s\r\n\r\n" % msg).encode("utf-8") + body

def main(url):
    resp = requests.get(url)

    print(psr7_message(resp).decode('utf-8').replace(u'\xa0', u' '))

if __name__ == '__main__':
    main(args.url)
```

重點是過濾掉 `Transfer-Encoding: chunked` 和 `Content-Encoding` 這些 header，避免 PHP 端解析時出問題。

## PHP 端：實作 PSR-18 ClientInterface

PHP 這邊實作 `ClientInterface`，透過 `Symfony\Component\Process\Process` 呼叫 Python script，再用 `Message::parseResponse` 把輸出解析成 `ResponseInterface`。

```php
namespace App\Services;

use GuzzleHttp\Psr7\Message;
use GuzzleHttp\Psr7\Response;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

class ScraperClient implements ClientInterface
{
    private static ?string $python = null;

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        try {
            $process = new Process([
                $this->findPython3(),
                resource_path('path/to/main.py'),
                (string)$request->getUri(),
            ]);

            return Message::parseResponse($process->getOutput());
        } catch (ProcessFailedException $e) {
            return new Response(500, [], $e->getMessage());
        }
    }

    private function findPython3(): string
    {
        if (! self::$python) {
            $executableFinder = new ExecutableFinder();

            foreach (['python3', 'python'] as $binary) {
                $python = $executableFinder->find($binary);
                if ($python) {
                    return self::$python = $python;
                }
            }
        }

        return self::$python;
    }
}
```

因為實作了 `ClientInterface`，所以在 PHP 端可以像平常使用 HTTP client 一樣呼叫，完全不需要改變既有的使用習慣。需要換回 Guzzle 或其他 client 時，只要抽換實作就好。
