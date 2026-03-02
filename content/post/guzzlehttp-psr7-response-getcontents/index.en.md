---
title: 'Gotcha with GuzzleHttp PSR-7 Response getContents'
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

## Two Ways to Get the Body

After getting a Response from GuzzleHttp, there are two ways to retrieve the content:

```php
// Method 1: Cast to string
(string) $response->getBody();

// Method 2: getContents()
$response->getBody()->getContents();
```

On the first call, both return the same result. But calling them twice reveals a difference.

## The Difference

```php
// Method 1: Both calls return content
(string) $response->getBody(); // has content
(string) $response->getBody(); // has content

// Method 2: Second call returns empty
$response->getBody()->getContents(); // has content
$response->getBody()->getContents(); // empty string
```

## Why

Looking at the source code makes it clear. `__toString` calls `seek(0)` to reset the stream pointer, so casting to string always reads the full content:

```php
class Stream implements StreamInterface
{
    public function __toString()
    {
        try {
            $this->seek(0); // Reset pointer
            return (string) stream_get_contents($this->stream);
        } catch (\Exception $e) {
            return '';
        }
    }
}
```

`getContents()` does not reset the pointer -- it reads from the current position forward. After the first read, the pointer is at the end, so the second read returns nothing.

If you need to use `getContents()` and read multiple times, call `$response->getBody()->rewind()` first.
