---
title: 'Laravel Testing: Assert View Data Without Parsing HTML'
description: 'HTML assertions on complex views are brittle. Use viewData() to assert view variables directly, and compare Models by id or toArray() to avoid identity issues.'
slug: laravel-testing-view-data
date: '2022-11-29T15:58:53+08:00'
categories:
- Laravel
- Testing
tags:
- Laravel
- Testing
- Blade
image: featured.jpg
draft: false
---

When dealing with complex pages in Laravel Feature Tests, testing HTML directly is painful. Instead, you can test just the data passed to the View.

## Use viewData to Retrieve View Variables

`$response->viewData('key')` returns the variable passed to the View:

```php
// routes/web.php
Route::get('/', function () {
    return view('welcome', [
        'foo' => 'bar',
    ]);
});
```

```php
namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_only_view_data(): void
    {
        $response = $this->get('/')->assertOk();

        self::assertEquals('bar', $response->viewData('foo'));
    }
}
```

## Watch Out for Object Identity When Comparing Models

When View data contains a Model fetched from the database, comparing two Model objects directly with `assertEquals` will fail:

```php
// routes/web.php
Route::get('/', function () {
    $user = User::firstOrFail();

    return view('welcome', [
        'foo' => 'bar',
        'user' => $user,
    ]);
});
```

```php
class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_view_data(): void
    {
        /** @var User $user */
        $user = User::factory()->create();

        $response = $this->get('/')->assertOk();

        self::assertEquals('bar', $response->viewData('foo'));
        // This fails because the route re-fetches from DB -- it's not the same object
        self::assertEquals($user, $response->viewData('user'));
    }
}
```

The route fetches the User from the database again. Even though the data is the same, it's not the same object instance. Compare attributes instead:

```php
self::assertEquals($user->id, $response->viewData('user')->id);
self::assertEquals($user->toArray(), $response->viewData('user')->toArray());
```

`viewData` only verifies that data was correctly passed to the View. It cannot test whether JavaScript, CSS, or Blade templates render the variables correctly on the frontend.

## References

- [Laravel Docs: HTTP Tests - assertViewHas / viewData](https://laravel.com/docs/testing#assert-view-has)
- [Laravel Docs: Database Testing - Model Factories](https://laravel.com/docs/database-testing#defining-model-factories)
- [Laravel Docs: Database Testing - RefreshDatabase trait](https://laravel.com/docs/database-testing#resetting-the-database-after-each-test)
