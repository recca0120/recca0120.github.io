---
title: 'Always Add numeric When Validating Numbers in Laravel'
description: 'Laravel min/max rules compare string length by default; always add the numeric rule when validating numbers to compare values.'
slug: laravel-validation-numeric
date: '2022-11-23T08:30:00+08:00'
categories:
- Laravel
tags:
- Laravel
- Validation
image: featured.png
draft: false
---

I used `min:1` to reject the number 0, but the validation passed anyway.

## Why the min Rule Didn't Work

You might write the validation like this:

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

A test sending `value = 0` should get a 422:

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

The test fails — validation passes.

## Frontend Data Is Always a String

Data POSTed from the frontend is treated as strings by Laravel. So `0` becomes the string `"0"`, and `min:1` checks string length for strings — `"0"` has length 1, so it passes.

Add `numeric` so Laravel knows the field is a number, and `min` will compare values instead:

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

So for number-related validation rules (`min`, `max`, `between`), always add `numeric` first — otherwise Laravel compares string lengths.
