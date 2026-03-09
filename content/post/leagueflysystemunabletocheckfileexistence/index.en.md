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
image: featured.jpg
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

## References

- [Laravel Docs: File Storage - S3 Driver](https://laravel.com/docs/filesystem#s3-driver-configuration)
- [League Flysystem Official Documentation](https://flysystem.thephpleague.com/docs/)
- [AWS Docs: S3 IAM Actions Reference](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-actions.html)
- [Laravel GitHub Issue #45639: S3 exists() 403 discussion](https://github.com/laravel/framework/issues/45639)
