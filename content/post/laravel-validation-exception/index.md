---
title: 用 ValidationException::withMessages 手動丟出 Laravel 驗證錯誤
description: '呼叫外部 API 出錯時，用 ValidationException::withMessages 把錯誤包裝成 Laravel 標準驗證格式，讓前端用同一套邏輯顯示錯誤訊息。'
slug: how-to-throw-a-validation-exception-manually-in-laravel
date: '2020-05-24T12:51:54+08:00'
categories:
- Laravel
- PHP
tags:
- Laravel
- Validation
- PHP
draft: false
image: featured.jpg
---

## 情境

呼叫外部 API 時收到錯誤回應，想把這個錯誤包裝成 `ValidationException` 丟回前端，讓前端能用跟表單驗證一樣的方式顯示錯誤訊息。

## 做法

```php
use Illuminate\Validation\ValidationException;

try {
    // 呼叫外部 API
} catch (Exception $e) {
    throw ValidationException::withMessages([
        'field' => [$e->getMessage()],
    ]);
}
```

`withMessages()` 接受的格式跟 Validator 的錯誤格式一致，key 是欄位名稱，value 是錯誤訊息的陣列。前端收到的 JSON 結構會跟一般驗證失敗一模一樣。

## 參考資源

- [Laravel 官方文件：驗證 - 手動建立 Validator](https://laravel.com/docs/validation#manually-creating-validators)
- [Laravel 官方文件：錯誤處理 - HTTP 例外](https://laravel.com/docs/errors#http-exceptions)
- [Laravel GitHub：ValidationException 原始碼](https://github.com/laravel/framework/blob/master/src/Illuminate/Validation/ValidationException.php)
