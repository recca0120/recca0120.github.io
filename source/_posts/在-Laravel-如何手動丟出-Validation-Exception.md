title: 在 Laravel 如何手動丟出 Validation Exception
comments: true
tags:
  - laravel
urlname: how-to-throw-a-validation-exception-manually-in-laravel
categories:
  - laravel
author: recca0120
abbrlink: 43217
date: 2020-05-24 12:51:54
updated: 2020-05-24 12:51:54
keywords:
description:
---

呼叫 api 時回傳錯誤回來後，希望把 api 的錯誤訊息偽裝成 ValidationException 時，我們可以這樣做

```php

use Illuminate\Validation\ValidationException;

try {
    // call api
} catch (Exception $e) {
    throw ValidationException::withMessages([
        'field' => [$e->getMessage()],
    ]);
}
```