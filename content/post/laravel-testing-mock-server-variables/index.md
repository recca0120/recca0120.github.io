---
title: 在 Laravel Feature 測試中如何 mock $_SERVER
description: 'Laravel Feature 測試可透過 request 方法的參數或 withServerVariables() 來偽造 $_SERVER 變數如 REMOTE_ADDR。'
slug: how-to-mock_$\_SERVER-in-laravel-feature-testing
date: '2020-06-23T12:18:59+08:00'
categories:
- Testing
tags:
- Laravel
- Testing
draft: false
image: featured.png
---

## 情境

寫 Feature 測試時有時候需要偽造 `$_SERVER` 變數，例如改 `REMOTE_ADDR` 來測試 IP 相關的邏輯。

## 做法

Laravel 的測試方法本身就支援傳入 server 變數。

### GET 請求

第二個參數就是 server 變數：

```php
$this->get('/api/path', [
    'REMOTE_ADDR' => '10.1.0.1'
]);

// JSON 版
$this->getJson('/api/path', [
    'REMOTE_ADDR' => '10.1.0.1'
]);
```

### POST 請求

第三個參數是 server 變數（第二個是 request body）：

```php
$this->post('/api/path', ['foo' => 'bar'], [
    'REMOTE_ADDR' => '10.1.0.1'
]);

$this->postJson('/api/path', ['foo' => 'bar'], [
    'REMOTE_ADDR' => '10.1.0.1'
]);
```

### 整個測試共用

不想每個 request 都帶的話，用 `withServerVariables()` 設一次就好：

```php
$this->withServerVariables(['REMOTE_ADDR' => '10.1.0.1']);
```

之後同一個測試方法裡的所有請求都會套用。
