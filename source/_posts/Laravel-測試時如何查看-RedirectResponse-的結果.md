title: Laravel 測試時如何查看 RedirectResponse 的結果
urlname: laravel-testing-what-happens-after-a-redirect
comments: true
tags:
  - laravel
  - testing
categories: '-laravel -testing'
author: recca0120
abbrlink: 52079
date: 2020-06-25 12:04:22
updated: 2020-06-25 12:04:22
keywords:
description:
---
在 Laravel 遇到以下的程式碼時

```php
class UserController extends Controller {
    public function create(Request $request) {
        $user = User::create($request->all());
        
        return redirect(uri('users.show', ['id' => $user->id]));
    }
}
```

在測試的時候想要看到轉址的結果，我們能怎麼做呢？

`Laravel >= 5.5.19`
```php
class UserControllerTest extends TestCase {
    public function test_it_should_show_user_after_create_user() {
        $this
            ->followingRedirects() // 加這行即可
            ->post('user', [
                'name' => 'foo'
            ]);
    }
}
```

`Laravel < 5.4.12:`
```php
class UserControllerTest extends TestCase {
    public function test_it_should_show_user_after_create_user() {
        $this
            ->followRedirects() // 加這行即可
            ->post('user', [
                'name' => 'foo'
            ]);
    }
}
```