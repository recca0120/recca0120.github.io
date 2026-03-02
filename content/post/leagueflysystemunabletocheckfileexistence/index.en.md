---
title: 'League\Flysystem\UnableToCheckFileExistence'
description: 'S3 Storage::exists throws 403 UnableToCheckFileExistence when the IAM policy is missing s3:ListBucket permission.'
slug: leagueflysystemunabletocheckfileexistence
date: '2023-01-19T03:12:27+08:00'
categories:
- PHP
tags:
- Flysystem
- Laravel
- AWS
image: featured.png
draft: false
---

When using Laravel's Storage to check if a file exists on S3, it throws `League\Flysystem\UnableToCheckFileExistence` with a `403 Forbidden` error if the file doesn't exist.

```php
Storage::disk('s3')->exists('path/to.jpg');
```

## Why 403 Instead of 404

When an AWS S3 user has `s3:GetObject` permission but lacks `s3:ListBucket`, the API returns 403 instead of 404 for non-existent files. This is AWS's underlying behavior — Flysystem can't distinguish between "no permission" and "file doesn't exist."

See this [Laravel issue](https://github.com/laravel/framework/issues/45639) for related discussion.

## Add s3:ListBucket Permission

After adding `s3:ListBucket` to the IAM Policy, checking for non-existent files will correctly return `false`.
