---
title: 'Throw Laravel ValidationException Manually for API Errors'
description: 'Wrap external API errors with ValidationException::withMessages to output Laravel validation format, so the frontend displays them like regular form errors.'
slug: how-to-throw-a-validation-exception-manually-in-laravel
date: '2020-05-24T12:51:54+08:00'
categories:
- Laravel
tags:
- Laravel
- Validation
- PHP
draft: false
image: featured.png
---

## Scenario

When calling an external API and receiving an error response, I want to wrap the error as a `ValidationException` so the frontend can display it the same way as form validation errors.

## Solution

```php
use Illuminate\Validation\ValidationException;

try {
    // call external API
} catch (Exception $e) {
    throw ValidationException::withMessages([
        'field' => [$e->getMessage()],
    ]);
}
```

`withMessages()` accepts the same format as Validator errors — the key is the field name and the value is an array of error messages. The JSON structure the frontend receives will be identical to a regular validation failure.
