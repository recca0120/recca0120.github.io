---
title: 'Fix S3 UnableToCheckFileExistence 403 Error in Laravel'
description: 'Without s3:ListBucket in the IAM policy, S3 returns 403 for missing files, making [Flysystem](https://flysystem.thephpleague.com) throw UnableToCheckFileExistence. Adding the permission resolves it.'
slug: leagueflysystemunabletocheckfileexistence
date: '2023-01-19T03:12:27+08:00'
categories:
- Laravel
- DevOps
tags:
- Laravel
- Flysystem
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
