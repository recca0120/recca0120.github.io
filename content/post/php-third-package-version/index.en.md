---
title: 'Getting Third-Party Package Versions in PHP'
slug: php-third-package-version
date: '2023-02-25T10:04:03+08:00'
categories:
- PHP
tags:
- PHP
- Composer
image: featured.png
draft: false
---

Sometimes you need to check a Composer package's version at runtime, e.g., for backward compatibility or feature flags.

## Using InstalledVersions

Composer 2's built-in `InstalledVersions` class can query the version of any installed package:

```php
use Composer\InstalledVersions;

InstalledVersions::getVersion('laravel/framework');
```
