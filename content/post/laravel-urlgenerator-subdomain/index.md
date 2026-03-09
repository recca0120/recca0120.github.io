---
title: 'Laravel Subdomain Route 裡產出 Root Domain 網址：clone UrlGenerator'
date: '2026-03-17T09:00:00+08:00'
slug: laravel-urlgenerator-subdomain
image: featured.jpg
description: 'Laravel 在 subdomain route 裡呼叫 url() 或 route()，產出的網址會帶 subdomain。用 clone app(UrlGenerator::class) 再 useOrigin() 就能在不影響全域的情況下產出 root domain 網址。'
categories:
  - Laravel
  - PHP
tags:
  - laravel
  - php
  - testing
  - routing
---

在 Laravel 的 subdomain route 裡，`url('test')` 回傳的是 `https://foo.com/test`。
但如果你要產出主站的連結，例如寄 email 給使用者、或 API response 裡要帶回主站網址，這樣就錯了。
`clone` 一份 `UrlGenerator` 再 `useOrigin()`，三行解決。

## 問題

Route 設定了 subdomain：

```php
Route::middleware([])->domain('foo.com')->group(function () {
    Route::get('/test', function () {
        return [
            'current' => url('test'),  // 產出 https://foo.com/test
        ];
    });
});
```

在這個 context 裡，`url()` 和 `route()` 都會產出帶 subdomain 的網址。這是 Laravel 的預期行為，但如果你需要的是主站（`app.url`）的網址，就得繞過去。

## 為什麼不能直接改

`app(UrlGenerator::class)` 從容器拿到的是 singleton。直接改它的 origin 會影響到這個 request 裡所有後續的 `url()` 呼叫，包括 middleware、response 等等。這是副作用，不能這樣做。

## 解法：clone 再 useOrigin

```php
Route::get('/test', function () {
    // clone 一份，不動到原本的 singleton
    $urlGenerator = clone app(UrlGenerator::class);

    // 把 clone 的 origin 指向 app.url（主站）
    $urlGenerator->useOrigin(config('app.url'));

    return [
        'origin'  => $urlGenerator->to('test'),  // https://localhost/test（主站）
        'current' => url('test'),                 // https://foo.com/test（subdomain，沒被動到）
    ];
});
```

輸出：

```json
{
  "origin":  "https://localhost/test",
  "current": "https://foo.com/test"
}
```

`clone` 讓兩個 UrlGenerator 互相獨立，`useOrigin()` 只影響那份 clone。原本的 `url()` helpers 完全沒被動到。

## 在測試裡驗證

寫測試的時候可以用 `dump()` 直接看輸出確認：

```php
it('subdomain route 產出正確的網址', function () {
    Route::middleware([])->domain('foo.com')->group(function () {
        Route::get('/test', function () {
            $urlGenerator = clone app(UrlGenerator::class);
            $urlGenerator->useOrigin(config('app.url'));

            return [
                'origin'  => $urlGenerator->to('test'),
                'current' => url('test'),
            ];
        })->name('domain.test');
    });

    $response = getJson('https://foo.com/test');

    $response->assertJson([
        'origin'  => 'https://localhost/test',
        'current' => 'https://foo.com/test',
    ]);
});
```

## 實際應用場景

**寄 Email**：使用者在 `tenant.app.com` 操作，但信件裡的連結要指向 `app.com` 主站。

```php
// 在 subdomain 的 controller 裡
public function sendWelcomeEmail(User $user): void
{
    $urlGenerator = clone app(UrlGenerator::class);
    $urlGenerator->useOrigin(config('app.url'));

    $loginUrl = $urlGenerator->route('login');  // https://app.com/login，不帶 subdomain

    Mail::to($user)->send(new WelcomeMail($loginUrl));
}
```

**API response 裡的連結**：multi-tenant 架構，API 回傳的 canonical URL 或 redirect 連結要是主站網址而不是 tenant 的 subdomain。

## useOrigin 做了什麼

`useOrigin()` 是 Laravel `UrlGenerator` 的方法，設定產出網址時使用的 scheme 和 host。它不改變 route 的 domain 設定，只改變最終組出來的 URL 字串的 origin 部分。

```php
// Laravel 原始碼的效果類似這樣
public function useOrigin(string $origin): static
{
    [$this->forceScheme, $host] = explode('://', $origin);
    $this->forceRootUrl($origin);
    return $this;
}
```

`clone` 確保這個改動只活在這份 instance 裡，用完就消失，不污染全域狀態。

## 小結

遇到 subdomain route 裡需要產出 root domain 網址，`clone app(UrlGenerator::class)` 再 `useOrigin()` 是最乾淨的做法。不需要暫時改 config、不需要 `URL::forceRootUrl()`（那個是全域的），也不用自己拼字串。

## 參考資源

- [Laravel 官方文件：URL 產生 - 命名路由](https://laravel.com/docs/urls#named-routes)
- [Laravel 官方文件：路由 - Subdomain 路由](https://laravel.com/docs/routing#subdomain-routing)
- [Laravel GitHub：UrlGenerator 原始碼](https://github.com/laravel/framework/blob/master/src/Illuminate/Routing/UrlGenerator.php)
- [Laravel 官方文件：服務容器 - 綁定與解析](https://laravel.com/docs/container)
