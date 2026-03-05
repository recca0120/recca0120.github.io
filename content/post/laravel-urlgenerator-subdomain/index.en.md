---
title: 'Generate Root Domain URLs Inside Laravel Subdomain Routes: clone UrlGenerator'
date: '2026-03-17T09:00:00+08:00'
slug: laravel-urlgenerator-subdomain
description: 'Inside a Laravel subdomain route, url() and route() produce URLs with the subdomain. Clone app(UrlGenerator::class) and call useOrigin() to generate root domain URLs without affecting global state.'
categories:
  - Backend
tags:
  - laravel
  - php
  - testing
  - routing
---

Inside a Laravel subdomain route, `url('test')` returns `https://foo.com/test`.
But if you need a link to the main site — for an email, or an API response — that's wrong.
Clone a `UrlGenerator` and call `useOrigin()`. Three lines.

## The Problem

A route is registered under a subdomain:

```php
Route::middleware([])->domain('foo.com')->group(function () {
    Route::get('/test', function () {
        return [
            'current' => url('test'),  // returns https://foo.com/test
        ];
    });
});
```

Inside this context, both `url()` and `route()` produce URLs with the subdomain. That's Laravel's expected behavior — but if you need a main site (`app.url`) URL, you have to work around it.

## Why You Can't Just Modify It Directly

`app(UrlGenerator::class)` returns a singleton from the container. Changing its origin directly affects every subsequent `url()` call in the request — middleware, responses, everything. That's a side effect you don't want.

## The Solution: clone Then useOrigin

```php
Route::get('/test', function () {
    // Clone a copy — leaves the original singleton untouched
    $urlGenerator = clone app(UrlGenerator::class);

    // Point the clone's origin at app.url (the main site)
    $urlGenerator->useOrigin(config('app.url'));

    return [
        'origin'  => $urlGenerator->to('test'),  // https://localhost/test (main site)
        'current' => url('test'),                 // https://foo.com/test (subdomain, untouched)
    ];
});
```

Output:

```json
{
  "origin":  "https://localhost/test",
  "current": "https://foo.com/test"
}
```

`clone` makes the two UrlGenerator instances independent. `useOrigin()` only affects the cloned copy. The global `url()` helpers are completely unaffected.

## Verifying It in a Test

You can use `dump()` to check the output directly while writing the test:

```php
it('subdomain route generates correct URLs', function () {
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

## Real-World Use Cases

**Sending email**: The user is on `tenant.app.com`, but links in the email should point to `app.com`.

```php
// Inside a subdomain controller
public function sendWelcomeEmail(User $user): void
{
    $urlGenerator = clone app(UrlGenerator::class);
    $urlGenerator->useOrigin(config('app.url'));

    $loginUrl = $urlGenerator->route('login');  // https://app.com/login, no subdomain

    Mail::to($user)->send(new WelcomeMail($loginUrl));
}
```

**API responses with canonical links**: In a multi-tenant architecture, canonical URLs or redirect links in API responses should point to the main site, not the tenant's subdomain.

## What useOrigin Does

`useOrigin()` is a `UrlGenerator` method that sets the scheme and host used when building URLs. It doesn't change the route's domain constraint — it only changes the origin portion of the resulting URL string.

```php
// Effect is similar to this internally
public function useOrigin(string $origin): static
{
    [$this->forceScheme, $host] = explode('://', $origin);
    $this->forceRootUrl($origin);
    return $this;
}
```

`clone` ensures this change lives only in that one instance. When it goes out of scope, the change disappears. No global state pollution.

## Summary

When you need a root domain URL inside a subdomain route, `clone app(UrlGenerator::class)` followed by `useOrigin()` is the cleanest approach. No temporary config changes, no `URL::forceRootUrl()` (that's global), no manual string concatenation.
