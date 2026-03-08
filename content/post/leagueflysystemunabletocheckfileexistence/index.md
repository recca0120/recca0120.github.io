---
title: 'S3 Storage::exists 拋出 403 UnableToCheckFileExistence 的解法'
description: 'IAM 缺少 s3:ListBucket 時，S3 對不存在的檔案回傳 403 而非 404，[Flysystem](https://flysystem.thephpleague.com) 因此拋出例外。補上權限後 exists() 即可正常回傳 false。'
slug: leagueflysystemunabletocheckfileexistence
date: '2023-01-19T03:12:27+08:00'
categories:
  - Laravel
  - DevOps
tags:
  - Laravel
  - Flysystem
  - AWS
image: featured.jpg
draft: false
---

用 Laravel 的 Storage 檢查 S3 上的檔案是否存在時，如果檔案不存在會拋出 `League\Flysystem\UnableToCheckFileExistence`，完整錯誤是 `403 Forbidden`。

```php
Storage::disk('s3')->exists('path/to.jpg');
```

## 為什麼是 403 而不是 404

AWS S3 的 API 在使用者有 `s3:GetObject` 但沒有 `s3:ListBucket` 權限時，檔案不存在也會回傳 403 而非 404。這是 AWS 底層的行為，Flysystem 無法區分「沒權限」和「檔案不存在」。

相關討論可以參考這個 [Laravel issue](https://github.com/laravel/framework/issues/45639)。

## 補上 s3:ListBucket 權限

在 IAM Policy 加上 `s3:ListBucket` 權限後，檔案不存在就會正常回傳 `false`。
