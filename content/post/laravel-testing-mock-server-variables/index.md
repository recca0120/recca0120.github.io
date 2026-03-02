---
title: 'Laravel Feature 測試中偽造 $_SERVER 變數的 2 種方法'
description: '測試 IP 限制等依賴 $_SERVER 的邏輯時，可透過 get/post 方法的 server 參數單次傳入，或用 withServerVariables() 在整個測試方法內全域生效。'
slug: how-to-mock_$\_SERVER-in-laravel-feature-testing
date: '2020-06-23T12:18:59+08:00'
categories:
- Laravel
- Testing
tags:
- Laravel
- Testing
- PHPUnit
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
