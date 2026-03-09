---
title: 'Laravel Testing: Assert Final Page Content After a Redirect'
description: 'POST requests only return a 302, hiding the final page. Use followingRedirects() to automatically follow redirects and assert on the destination page content.'
slug: laravel-testing-what-happens-after-a-redirect
date: '2020-06-25T12:04:22+08:00'
categories:
- Laravel
- Testing
tags:
- Laravel
- PHPUnit
- Testing
draft: false
image: featured.jpg
---

## Scenario

A controller creates data and then redirects:

```php
class UserController extends Controller {
    public function create(Request $request) {
        $user = User::create($request->all());

        return redirect(uri('users.show', ['id' => $user->id]));
    }
}
```

When writing tests, you want to verify the content of the page after the redirect, but `$this->post(...)` only returns a 302 response -- you can't see the final page.

## Solution

Add `followingRedirects()` to make the test automatically follow the redirect:

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

In older versions, the method name drops the "ing":

```php
$this->followRedirects()->post('user', ['name' => 'foo']);
```

## References

- [Laravel Docs: HTTP Tests](https://laravel.com/docs/http-tests)
- [Laravel Source: MakesHttpRequests::followingRedirects](https://github.com/laravel/framework/blob/master/src/Illuminate/Testing/Concerns/MakesHttpRequests.php)
- [Laravel Docs: HTTP Responses — Redirects](https://laravel.com/docs/responses#redirects)
