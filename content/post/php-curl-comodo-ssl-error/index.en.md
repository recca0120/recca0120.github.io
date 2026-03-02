---
title: Fixing Comodo RSA Certification Authority SSL Error in PHP Curl
description: 'Fix Comodo SSL certificate expired error in PHP Curl by specifying the certificate path via GuzzleHttp verify option.'
slug: how-to-fix-comodo-rsa-certification-authority-ssl-error-in-php
date: '2020-06-01T18:29:17+08:00'
categories:
- PHP
tags:
- PHP
- Guzzle
- Laravel
draft: false
image: featured.png
---

## Problem

When fetching data from a website using GuzzleHttp, I got this error:

```
cURL error 60: SSL certificate problem: certificate has expired
```

Opening the same URL in Chrome worked fine. Checking the SSL certificate showed it was issued by **COMODO RSA Organization Validation Secure Server CA**. After some research, I found the Root CA certificate was missing on Linux.

## First Attempt

I downloaded the certificate from the [Comodo website](https://support.comodo.com/index.php?/Knowledgebase/Article/View/969/108/root-comodo-rsa-certification-authority-sha-2) and placed it under `/etc/ssl/certs`. Still got the same error.

## Final Solution

Specify the certificate path directly in GuzzleHttp:

```php
use GuzzleHttp\Client;

$client = new Client(['verify' => '憑證路徑']);
$client->get('https://xx.xx.xx');
```

## How to Do It in Laravel

If all HTTP requests need this certificate, bind it in `AppServiceProvider`:

```php
use GuzzleHttp\Client;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->bind(Client::class, function () {
            return new Client(['verify' => '憑證路徑']);
        });
    }
}
```

If only a specific service needs it, use contextual binding:

```php
use App\Services\GithubService;
use GuzzleHttp\Client;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->when(GitHubService::class)
            ->needs(Client::class)
            ->give(function () {
                return new Client(['verify' => '憑證路徑']);
            });
    }
}
```

This way only the Client injected into `GitHubService` will include the certificate — other usages remain unaffected.
