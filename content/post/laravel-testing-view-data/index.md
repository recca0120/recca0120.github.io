---
title: 'Laravel Testing 只測 View data'
slug: laravel-testing-view-data
date: '2022-11-29T15:58:53+08:00'
categories:
- PHP
tags:
- Laravel
image: featured.png
draft: false
---

Laravel Feature Test 遇到複雜的畫面時，直接測 HTML 很痛苦，其實可以只測傳給 View 的資料。

## 用 viewData 取回 View 變數

`$response->viewData('key')` 可以直接取回傳給 View 的變數：

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

## 比較 Model 時要注意物件同一性

當 View data 包含從資料庫撈出來的 Model 時，直接用 `assertEquals` 比較兩個 Model 物件會失敗：

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
        // 這行會失敗，因為 route 裡重新從 DB 撈了一次，不是同一個物件
        self::assertEquals($user, $response->viewData('user'));
    }
}
```

原因是 route 裡面會重新從資料庫取出 User，雖然資料相同但不是同一個物件實例。改成比較 attributes 就好：

```php
self::assertEquals($user->id, $response->viewData('user')->id);
self::assertEquals($user->toArray(), $response->viewData('user')->toArray());
```

要注意的是，`viewData` 只能驗資料有沒有正確傳到 View，前端的 JavaScript、CSS 以及 Blade template 有沒有正確輸出變數，這個方法是測不到的。
