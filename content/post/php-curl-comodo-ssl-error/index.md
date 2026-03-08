---
title: 'PHP Curl Comodo SSL 憑證過期錯誤：用 GuzzleHttp verify 解決'
description: 'PHP Curl 在 Linux 拋出 Comodo SSL 過期錯誤，原因是系統缺少 Root CA。用 GuzzleHttp verify 指定憑證路徑，可全域或針對單一 Service 設定。'
slug: how-to-fix-comodo-rsa-certification-authority-ssl-error-in-php
date: '2020-06-01T18:29:17+08:00'
categories:
  - PHP
  - Laravel
tags:
  - PHP
  - Guzzle
  - Laravel
draft: false
image: featured.jpg
---

## 問題

用 [Guzzle](https://docs.guzzlephp.org) 抓某個網站的資料時噴了這個錯：

```
cURL error 60: SSL certificate problem: certificate has expired
```

用 Chrome 打開同一個網址完全正常。檢查 SSL 證書發現是 **COMODO RSA Organization Validation Secure Server CA**，查了之後才知道是 Linux 上缺少這張 Root CA 憑證。

## 第一次嘗試

到 [Comodo 官網](https://support.comodo.com/index.php?/Knowledgebase/Article/View/969/108/root-comodo-rsa-certification-authority-sha-2) 下載憑證，放到 `/etc/ssl/certs` 底下。結果跑起來還是一樣的錯。

## 最終解法

直接在 GuzzleHttp 指定憑證路徑：

```php
use GuzzleHttp\Client;

$client = new Client(['verify' => '憑證路徑']);
$client->get('https://xx.xx.xx');
```

## 在 Laravel 裡怎麼做

如果所有 HTTP 請求都需要用這張憑證，在 `AppServiceProvider` 裡綁定：

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

但如果只有特定 Service 需要，可以用 contextual binding：

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

這樣只有 `GitHubService` 注入的 Client 會帶上憑證，其他地方不受影響。
