---
title: 'Passing Python Requests Responses to PHP via PSR-7 Messages'
description: 'Output Python HTTP responses as PSR-7 message strings and parse them in PHP with Message::parseResponse for cross-language data transfer.'
slug: psr7-message-python-requests-php
date: '2022-12-26T06:34:26+08:00'
categories:
- PHP
tags:
- PSR-7
- PHP
- Guzzle
image: featured.png
draft: false
---

Sometimes Python already has a great package for scraping web data, but all the downstream processing is in PHP. The question is: how do you pass a Python requests response back to PHP intact?

## Why PSR-7 Message Format

HTTP messages are a plain-text protocol, and PSR-7 defines a standard message interface. As long as the Python side outputs the response as an HTTP message string, PHP can parse it directly into a `ResponseInterface` using `GuzzleHttp\Psr7\Message::parseResponse` — no manual header/body splitting needed.

## Python Side: Convert requests Response to PSR-7 Message

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

The key is filtering out `Transfer-Encoding: chunked` and `Content-Encoding` headers to avoid parsing issues on the PHP side.

## PHP Side: Implement PSR-18 ClientInterface

On the PHP side, implement `ClientInterface` to call the Python script via `Symfony\Component\Process\Process`, then parse the output into a `ResponseInterface` using `Message::parseResponse`.

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

Since it implements `ClientInterface`, you can use it just like any other HTTP client in PHP. When you need to switch back to Guzzle or another client, just swap the implementation.
