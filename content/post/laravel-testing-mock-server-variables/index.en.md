---
title: How to Mock $_SERVER in Laravel Feature Tests
slug: how-to-mock_$_SERVER-in-laravel-feature-testing
date: '2020-06-23T12:18:59+08:00'
categories:
- Testing
tags:
- Laravel
- Testing
draft: false
image: featured.png
---

## Scenario

When writing feature tests, you sometimes need to fake `$_SERVER` variables -- for example, changing `REMOTE_ADDR` to test IP-related logic.

## How To

Laravel's test methods natively support passing server variables.

### GET Requests

The second parameter is for server variables:

```php
$this->get('/api/path', [
    'REMOTE_ADDR' => '10.1.0.1'
]);

// JSON version
$this->getJson('/api/path', [
    'REMOTE_ADDR' => '10.1.0.1'
]);
```

### POST Requests

The third parameter is for server variables (the second is the request body):

```php
$this->post('/api/path', ['foo' => 'bar'], [
    'REMOTE_ADDR' => '10.1.0.1'
]);

$this->postJson('/api/path', ['foo' => 'bar'], [
    'REMOTE_ADDR' => '10.1.0.1'
]);
```

### Shared Across an Entire Test

If you don't want to pass them on every request, use `withServerVariables()` to set them once:

```php
$this->withServerVariables(['REMOTE_ADDR' => '10.1.0.1']);
```

All subsequent requests within the same test method will use these values.
