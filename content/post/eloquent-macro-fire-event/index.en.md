---
title: 'Eloquent Macro: Fire Specific Events After saveQuietly'
description: 'Save a model silently with saveQuietly, then selectively dispatch created or other Eloquent model events via a custom Builder macro fire method in Laravel.'
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

Sometimes we use `saveQuietly()` to persist data without triggering Eloquent events. But after saving, we may want to manually fire a specific event -- for example, only `created` without `creating`.

Laravel doesn't provide this out of the box, so we need to build it ourselves.

## What saveQuietly Does

`saveQuietly()` temporarily removes the event dispatcher, saves the model, then restores it. So none of the events (`creating`, `created`, `updating`, `updated`) will fire.

```php
// Simplified from Laravel source
public function saveQuietly(array $options = [])
{
    return static::withoutEvents(fn () => $this->save($options));
}
```

The problem: if I have validation or side effects in the `creating` event but want to skip `creating` in certain scenarios, save the model, and then manually fire `created` to notify other listeners -- how do I do that?

## Add a fire Method via Builder Macro

Define the macro in `AppServiceProvider`'s `boot` method:

```php
// app/Providers/AppServiceProvider.php
use Illuminate\Database\Eloquent\Builder;

public function boot(): void
{
    Builder::macro('fire', function (string $event) {
        /** @var Builder $this */
        $model = $this->getModel();
        $dispatcher = $model::getEventDispatcher();

        // Eloquent event naming format: "eloquent.{event}: App\Models\User"
        return $dispatcher->dispatch(
            "eloquent.{$event}: " . get_class($model),
            $model
        );
    });
}
```

Usage is straightforward:

```php
$user = new User([
    'name' => 'Recca',
    'email' => 'recca@example.com',
    'password' => Hash::make('password'),
]);

// Save quietly without firing any events
$user->saveQuietly();

// Manually fire the created event afterward
$user->newQuery()->fire('created');
```

## Test Verification

Write a test to confirm that `saveQuietly` doesn't fire events, but `fire` can trigger them manually:

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

        // saveQuietly does not trigger creating
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

        // Manually fire the created event
        $user->newQuery()->fire('created');

        $callback->shouldHaveBeenCalled()->once();
    }
}
```

## Alternative Approach

If calling `$user->newQuery()->fire(...)` every time feels verbose, you can add a trait directly to the Model:

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

Then you can simply call `$user->fireModelEvent('created')`. Note that Laravel's Model already has a `protected` method called `fireModelEvent`, so watch out for naming conflicts -- you might want to use `dispatchModelEvent` instead.
