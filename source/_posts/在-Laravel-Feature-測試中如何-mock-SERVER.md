title: 在 Laravel Feature 測試中如何 mock $_SERVER
urlname: how-to-mock_$_SERVER-in-laravel-feature-testing
comments: true
tags:
  - laravel - unittest
categories:
  - laravel
author: recca0120
abbrlink: 17434
date: 2020-06-23 12:18:59
updated: 2020-06-23 12:18:59
keywords:
description:
---
寫 Laravel Feature 測試時有時需要變更 REMOTE_ADDR ($_SERVER變數)，Laravel 用以下做法來變更

#### GET 時變更
```php
$this->get('/api/path', [
    'REMOTE_ADDR' => '10.1.0.1'
]);
// or
$this->getJson('/api/path', [
    'REMOTE_ADDR' => '10.1.0.1'
]);
```

#### POST 時變更
```php
$this->post('/api/path', ['foo' => 'bar'], [
    'REMOTE_ADDR' => '10.1.0.1'
]);
// or
$this->postJson('/api/path', ['foo' => 'bar'], [
    'REMOTE_ADDR' => '10.1.0.1'
]);
```

#### 使用 `withServerVariables`
```php
$this->withServerVariables(['REMOTE_ADDR' => '10.1.0.1']);
```