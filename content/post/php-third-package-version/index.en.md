---
title: 'Get Package Versions at Runtime with Composer 2'
description: "Use Composer 2's InstalledVersions::getVersion() to check package versions at runtime for feature flags or compatibility — no lock file parsing required."
slug: php-third-package-version
date: '2023-02-25T10:04:03+08:00'
categories:
- PHP
tags:
- PHP
- Composer
image: featured.jpg
draft: false
---

Sometimes you need to check a Composer package's version at runtime, e.g., for backward compatibility or feature flags.

## Using InstalledVersions

Composer 2's built-in [`InstalledVersions`](https://getcomposer.org/doc/07-runtime.md#installed-versions) class can query the version of any installed package:

```php
use Composer\InstalledVersions;

InstalledVersions::getVersion('laravel/framework');
```

## References

- [Composer Official Docs: InstalledVersions Runtime API](https://getcomposer.org/doc/07-runtime.md#installed-versions) — Complete method reference for the InstalledVersions class
- [Composer GitHub Repository](https://github.com/composer/composer) — Composer source code and changelog
- [PHP Manual: Namespaces and use statements](https://www.php.net/manual/en/language.namespaces.php) — PHP namespace fundamentals
