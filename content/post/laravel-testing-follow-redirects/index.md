---
title: Laravel 測試時如何查看 RedirectResponse 的結果
description: 'Laravel 測試時 POST 後只拿到 302，用 followingRedirects() 讓測試自動跟隨轉址並驗證最終頁面內容。'
slug: laravel-testing-what-happens-after-a-redirect
date: '2020-06-25T12:04:22+08:00'
categories:
- Testing
tags:
- Laravel
- PHPUnit
- Testing
draft: false
image: featured.png
---

## 情境

Controller 建完資料後做了 redirect：

```php
class UserController extends Controller {
    public function create(Request $request) {
        $user = User::create($request->all());

        return redirect(uri('users.show', ['id' => $user->id]));
    }
}
```

寫測試時想驗證轉址後的頁面內容，但 `$this->post(...)` 只會拿到 302 response，看不到最終頁面。

## 解法

加上 `followingRedirects()` 讓測試自動跟隨轉址：

**Laravel >= 5.5.19**

```php
class UserControllerTest extends TestCase {
    public function test_it_should_show_user_after_create_user() {
        $this
            ->followingRedirects()
            ->post('user', [
                'name' => 'foo'
            ]);
    }
}
```

**Laravel < 5.4.12**

舊版的方法名稱少一個 `ing`：

```php
$this->followRedirects()->post('user', ['name' => 'foo']);
```
