title: 如何讓 Laravel API 強制回應 json 格式
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
在使用 Laravel API 的時候，預設期望會是 json，但使用 postman 等 client 工具時，常常會回應 redirect 或者是 view，所以我們要如何修改才能強制回應 json 呢？

建立 middleware
```php
<?php

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

App\Http\Kernel 加入 middleware
```php
<?php

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

route/api.php 加入 middleware，force-json 必須放到最前面
```php
Route::group(['middleware' => ['force-json', 'auth:api']], function () {
    // put your router
});
```

這樣在未指定 accepts 或者 accepts 為 text/html 的狀況下，都會強制回應 json 格式了