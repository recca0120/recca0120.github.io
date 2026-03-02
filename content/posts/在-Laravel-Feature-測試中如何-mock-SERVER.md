---
title: 在 Laravel Feature 測試中如何 mock $_SERVER
slug: how-to-mock_$\_SERVER-in-laravel-feature-testing
date: '2020-06-23T12:18:59+08:00'
categories:
- laravel
tags:
- laravel
- testing
draft: false
---

寫 Laravel Feature 測試時有時需要變更 REMOTE_ADDR (\$\_SERVER 變數)，Laravel 用以下做法來變更

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
