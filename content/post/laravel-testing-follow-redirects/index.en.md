---
title: How to Inspect RedirectResponse Results in Laravel Tests
description: 'Use followingRedirects() in Laravel tests to automatically follow 302 redirects and assert on the final page content.'
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
