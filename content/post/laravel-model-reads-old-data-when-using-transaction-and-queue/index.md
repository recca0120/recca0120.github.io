---
title: 'Laravel Model reads old data when using Transaction and Queue'
description: '在 Transaction 裡 dispatch Job，因 SerializesModels 會重新查 DB，commit 前 Job 讀到舊資料，加 afterCommit 解決。'
slug: laravel-model-reads-old-data-when-using-transaction-and-queue
date: '2022-12-02T10:30:00+08:00'
categories:
- Laravel
tags:
- Laravel
- Queue
image: featured.png
draft: false
---

在 Transaction 裡 dispatch Job 到 Queue，Job 執行時讀到的竟然是舊資料。

## 為什麼 Job 拿到舊資料

先準備環境：Laravel 連接真實資料庫、Queue Driver 使用 Redis、資料庫裡已有一筆 User、執行 `php artisan queue:work`。

以下程式碼中，Job 延遲 3 秒執行，Transaction 在 5 秒後才 commit：

```php
// tests/Feature/ExampleTest.php
namespace Tests\Feature;

use App\Jobs\EmailChanged;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_dispatch_user_email_changed(): void
    {
        DB::transaction(static function () {
            $user = User::findOrFail(1);
            $oldEmail = $user->email;
            $newEmail = 'test'.random_int(1, 100).'@gmail.com';
            $user->fill(['email' => $newEmail])->save();
            EmailChanged::dispatch($user, $oldEmail, $newEmail)
                ->delay(now()->addSeconds(3));
            sleep(5);
        });
    }
}
```

```php
// app/Jobs/EmailChanged.php
namespace App\Jobs;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class EmailChanged implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    private User $user;
    private string $oldEmail;
    private string $newEmail;
    public function __construct(User $user, string $oldEmail, string $newEmail)
    {
        $this->user = $user;
        $this->oldEmail = $oldEmail;
        $this->newEmail = $newEmail;
    }
    public function handle(): void
    {
        dump('old email: '.$this->oldEmail);
        dump('new email: '.$this->newEmail);
        dump('current email:'.$this->user->email);
    }
}
```

執行後會發現 `current email` 還是 old email。因為 `SerializesModels` 只存 Model ID，Job 執行時會重新從 DB 撈資料，但這時 Transaction 還沒 commit，所以讀到的是舊值。

## 加上 afterCommit

只要在 dispatch 時加上 `afterCommit()`，Laravel 就會等 Transaction commit 後才真正把 Job 送進 Queue：

```php
EmailChanged::dispatch($user, $oldEmail, $newEmail)
    ->delay(now()->addSeconds(3))
    ->afterCommit();
```

這樣 Job 執行時就能讀到正確的新資料了。
