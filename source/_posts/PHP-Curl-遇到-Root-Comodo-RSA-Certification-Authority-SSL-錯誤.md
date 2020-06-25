title: 'PHP Curl 遇到 [Root] Comodo RSA Certification Authority SSL 錯誤'
urlname: how-to-fix-comodo-rsa-certification-authority-ssl-error-in-php
comments: true
tags:
  - php
  - laravel
categories:
  - php
author: recca0120
abbrlink: 31667
date: 2020-06-01 18:29:17
updated: 2020-06-01 18:29:17
keywords:
description:
---

用 PHP 抓取某網頁資料的時候遇到了
**GuzzleHttp/Exception/RequestException with message 'cURL error 60: SSL certificate problem: certificate has expired (see https://curl.haxx.se/libcurl/c/libcurl-errors.html)'**
這個錯誤訊息，第一時間用 chrome 瀏覽器打開頁面確都正常也全都正常顯示，一檢查 SSL 證書發現是 **COMODO RSA Organization Validation Secure Server CA**，
查了一番資料後原來是 Linux 沒有該 Root Certification，所以必須到 [Comodo RSA Certification Authority (SHA-2)](https://support.comodo.com/index.php?/Knowledgebase/Article/View/969/108/root-comodo-rsa-certification-authority-sha-2) 下載證書並儲存到 `/etc/ssl/certs` 下，以為這樣就能正常使用了，但程式一執行還是發生了同樣的錯誤，後來我直接採指定 ssl 證書的方法來解決這個問題

```php
use GuzzleHttp\Client;

$client = new Client(['verify' => '證書位置']);
$client->get('https://xx.xx.xx');
```

那在 Laravel 內能怎麼做？

```php

use GuzzleHttp\Client;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        $this->app->bind(Client::class, function () {
            return new Client(['verify' => '證書位置']);
        });
    }
    
    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        //
    }
```

但也不是每次 Client 都會用到這張證書所以可以改這樣寫
```php

namespace App\Providers;

use App\Services\GithubService;
use GuzzleHttp\Client;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        $this->app->when(GitHubService::class)
            ->needs(Client::class)
            ->given(function() {
                return new Client(['verify' => '證書位置']);
            });
    }
    
    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        //
    }
```