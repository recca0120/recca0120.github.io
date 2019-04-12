title: 使用 Laravel API 遇到 Exception 時強制回應 json 格式
urlname: laravel-api-always-json-response
comments: true
author: recca0120
tags:
  - laravel
  - api
  - json
categories:
  - laravel
abbrlink: c55cb7c4
date: 2019-03-29 10:30:00
---
## 前言

當使用 postman 等 client 工具呼叫 Laravel api，如果程式發生 Exception 時， Server 端有時會回應 html 或者是 redirect。這是非常不利於 api 的串接的，所以來解決這個問題吧

## 發生原因

首先來聊聊為何會有這種情況發生：當遇到 401(認證失敗)，422(輸入非法資料)時，Laravel 會有兩種不同的行為，第一種是把 Client 當成瀏覽器，並回應 redirect response，同時這也是預設的行為；而如果 request headers 有下面這三種 header：

- Accepts: application/json
- Accepts: application/javascript
- X-Requested-With: XMLHttpRequest

若有這三種 header 時，Laravel 則會認為 Client 是在 call API，這時就會回傳 JSON response，這也是我們使用 postman 測試 API 會想看到的回應。

## 如何解決

### 方案一

告訴串接 api 的工程師，發送 request 務必帶上 header

### 方案二

替 Client 增加 header 囉

#### 建立 Middleware

```php
namespace App\Http\Middleware;

use Closure;

class ForceJson
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request $request
     * @param  \Closure $next
     * @return mixed
     */
    public function handle($request, Closure $next)
    {
        if ($this->shouldChangeAccept($request)) {
            $request->headers->set('Accept', 'application/json');
        }

        return $next($request);
    }

    private function shouldChangeAccept($request)
    {
        $accepts = $request->headers->get('Accept');

        if (empty($accepts) === true) {
            return true;
        }

        return preg_match('/\*\/\*|\*|text\/html/', $accepts) === 1;
    }
}
```

#### App\Http\Kernel 加入 Middleware
```php
namespace App\Http;

use Illuminate\Foundation\Http\Kernel as HttpKernel;

class Kernel extends HttpKernel
{
    // 前略
    
    protected $routeMiddleware = [
		'force-json' => \App\Http\Middleware\ForceJson::class,
    ];
}
```

#### route/api.php 加入 Middleware

```php
// force-json 必須放到最前面
Route::group(['middleware' => ['force-json', 'auth:api']], function () {
    // put your router
});
```

這樣在未指定 accepts 或者 accepts 為 text/html 的狀況下，都會強制回應 json 格式了
