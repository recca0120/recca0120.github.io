---
title: 'Laravel min/max 驗證數字為何失效？加上 numeric 就解決了'
description: 'Laravel 的 min/max 規則預設比較字串長度而非數值，導致 0 通過驗證。加上 numeric 規則後才會做數值比較，避免驗證邏輯出錯。'
slug: laravel-validation-numeric
date: '2022-11-23T08:30:00+08:00'
categories:
- Laravel
- PHP
tags:
- Laravel
- Validation
- PHP
image: featured.jpg
draft: false
---

用 `min:1` 想擋掉數字 0，結果驗證竟然通過了。

## 為什麼 min 規則沒有擋住

我們可能會這樣寫驗證規則：

```php
namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MinNumberController extends Controller
{
    public function check(Request $request): JsonResponse
    {
        $request->validate(['value' => 'required|min:1']);

        return response()->json($request->all());
    }
}
```

寫個測試來驗證，送 `value = 0` 預期應該收到 422：

```php
namespace Tests\Feature\Http\Controllers;

use Tests\TestCase;

class MinNumberControllerTest extends TestCase
{
    public function test_validate_minimum_value(): void
    {
        $response = $this->postJson('/min-number/check', ['value' => 0]);

        $response->assertStatus(422);
    }
}
```

結果測試失敗，驗證居然通過了。

## 前端送過來的都是 string

從前端 POST 過來的資料，Laravel 會把所有 input 都當成 string 處理。所以 `0` 變成字串 `"0"`，而 `min:1` 對 string 是檢查字串長度，`"0"` 長度是 1，自然就通過了。

加上 `numeric` 讓 Laravel 知道這個欄位是數字，`min` 規則才會改用數值比較：

```php
class MinNumberController extends Controller
{
    public function check(Request $request): JsonResponse
    {
        $request->validate(['value' => 'required|numeric|min:1']);

        return response()->json($request->all());
    }
}
```

所以數字相關的驗證規則 (`min`, `max`, `between`) 前面都要加上 `numeric`，否則 Laravel 會用字串長度來判斷。

## 參考資源

- [Laravel 官方文件：驗證規則 - numeric](https://laravel.com/docs/validation#rule-numeric)
- [Laravel 官方文件：驗證規則 - min / max / between](https://laravel.com/docs/validation#rule-min)
- [Laravel 官方文件：驗證 - 可用的驗證規則總覽](https://laravel.com/docs/validation#available-validation-rules)
