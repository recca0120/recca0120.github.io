---
title: '用 Eloquent Macro 定義 fire 方法手動觸發 Event'
description: '用 saveQuietly 存資料後想手動觸發特定 Eloquent event，透過 Builder macro 定義 fire 方法實現。'
slug: eloquent-macro-fire-event
date: '2023-01-20T10:00:00+08:00'
categories:
- Laravel
tags:
- Laravel
- Eloquent
image: featured.png
draft: false
---

有時候我們會用 `saveQuietly()` 來存資料，刻意不觸發 Eloquent event。但存完之後又想手動觸發某個特定的 event，例如只觸發 `created` 而不觸發 `creating`。

Laravel 沒有內建這個功能，得自己想辦法。

## saveQuietly 做了什麼

`saveQuietly()` 會暫時把 event dispatcher 拿掉，存完再裝回去。所以 `creating`、`created`、`updating`、`updated` 這些 event 通通不會被觸發。

```php
// Laravel 原始碼簡化版
public function saveQuietly(array $options = [])
{
    return static::withoutEvents(fn () => $this->save($options));
}
```

問題來了：如果我在 `creating` event 裡做了一些 validation 或副作用，但在某些情境下想跳過 `creating` 直接存，存完再手動觸發 `created` 通知其他 listener，該怎麼做？

## 用 Builder macro 加一個 fire 方法

在 `AppServiceProvider` 的 `boot` 裡定義 macro：

```php
// app/Providers/AppServiceProvider.php
use Illuminate\Database\Eloquent\Builder;

public function boot(): void
{
    Builder::macro('fire', function (string $event) {
        /** @var Builder $this */
        $model = $this->getModel();
        $dispatcher = $model::getEventDispatcher();

        // Eloquent event 的命名格式是 "eloquent.{event}: App\Models\User"
        return $dispatcher->dispatch(
            "eloquent.{$event}: " . get_class($model),
            $model
        );
    });
}
```

用法很直覺：

```php
$user = new User([
    'name' => 'Recca',
    'email' => 'recca@example.com',
    'password' => Hash::make('password'),
]);

// 靜靜地存，不觸發任何 event
$user->saveQuietly();

// 存完之後，手動觸發 created event
$user->newQuery()->fire('created');
```

## 測試驗證

寫個測試確認 `saveQuietly` 不會觸發 event，但 `fire` 可以手動觸發：

```php
namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EloquentFireEventTest extends TestCase
{
    use RefreshDatabase;
    use WithFaker;

    public function test_save_quietly_does_not_fire_event(): void
    {
        $callback = \Mockery::spy(fn () => null);
        User::creating($callback);

        $user = new User([
            'name' => $this->faker->name,
            'email' => $this->faker->email,
            'password' => Hash::make('password'),
        ]);
        $user->saveQuietly();

        // saveQuietly 不會觸發 creating
        $callback->shouldNotHaveBeenCalled();
    }

    public function test_fire_dispatches_event_manually(): void
    {
        $callback = \Mockery::spy(fn () => null);
        User::created($callback);

        $user = new User([
            'name' => $this->faker->name,
            'email' => $this->faker->email,
            'password' => Hash::make('password'),
        ]);
        $user->saveQuietly();

        // 手動觸發 created event
        $user->newQuery()->fire('created');

        $callback->shouldHaveBeenCalled()->once();
    }
}
```

## 另一種寫法

如果覺得每次都要 `$user->newQuery()->fire(...)` 太囉唆，也可以直接在 Model 上加 trait：

```php
trait FiresEvents
{
    public function fireModelEvent(string $event): mixed
    {
        return static::getEventDispatcher()->dispatch(
            "eloquent.{$event}: " . static::class,
            $this
        );
    }
}
```

這樣就可以直接 `$user->fireModelEvent('created')` 了。不過 Laravel 的 Model 其實已經有一個 `protected` 的 `fireModelEvent` 方法，所以要注意命名衝突，可能改叫 `dispatchModelEvent` 比較安全。
