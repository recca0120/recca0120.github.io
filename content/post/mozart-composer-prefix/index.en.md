---
title: 'Mozart: Isolate Composer Dependencies in WordPress Plugins'
date: '2026-04-04T09:00:00+08:00'
slug: mozart-composer-prefix
description: "All WordPress plugins run in the same PHP process. If two plugins use different versions of the same library, only one version loads — and it might be the wrong one. Mozart prefixes your vendor dependencies with a custom namespace so they can't conflict with anyone else's."
categories:
  - PHP
tags:
  - mozart
  - composer
  - wordpress
  - php
  - namespace
---

WordPress plugin development has a unique problem: all plugins run in the same PHP process.

Your plugin uses `guzzlehttp/guzzle 7.0`. Another plugin uses `guzzlehttp/guzzle 6.0`. Both run `composer install` independently, but only one version gets loaded at runtime — whichever plugin's autoloader registers first. If the versions are incompatible, you get a fatal error.

You can't control this, because you don't know what else your users have installed.

[Mozart](https://github.com/coenjacobs/mozart)'s solution: copy your vendor dependencies and add your own namespace prefix to everything, making them completely distinct from anyone else's copy.

## The Core Problem

PHP classes are global. `GuzzleHttp\Client` can only have one definition.

Mozart renames it to `YourPlugin\Dependencies\GuzzleHttp\Client`. Even if someone else loads the original `GuzzleHttp\Client`, they're now entirely separate classes that don't interfere with each other.

## Installation

Mozart has its own dependencies. Use Docker or a PHAR to keep Mozart isolated from your project's vendor:

```bash
# Docker (recommended)
docker run --rm -it -v ${PWD}:/project/ coenjacobs/mozart /mozart/bin/mozart compose

# Global install (simpler, but risky)
composer global require coenjacobs/mozart

# PHAR
php mozart.phar compose
```

## Configuration

Add Mozart config to `extra` in `composer.json`:

```json
{
  "extra": {
    "mozart": {
      "dep_namespace": "MyPlugin\\Dependencies\\",
      "dep_directory": "/vendor-prefixed/",
      "classmap_prefix": "MyPlugin_",
      "packages": [
        "guzzlehttp/guzzle",
        "psr/http-client"
      ],
      "excluded_packages": [
        "psr/container"
      ],
      "delete_vendor_directories": true
    }
  }
}
```

| Option | Purpose |
|---|---|
| `dep_namespace` | Prefix added to all namespaces |
| `dep_directory` | Where processed files go |
| `classmap_prefix` | Prefix for classes without namespaces |
| `packages` | Which packages to process (all require entries if omitted) |
| `excluded_packages` | Packages to skip |
| `delete_vendor_directories` | Remove original vendor directories after processing |

## Running

```bash
# verify config
mozart config

# run prefixing
mozart compose
```

After running, `vendor-prefixed/` contains the rewritten code:

```php
// Before
namespace GuzzleHttp;
use Psr\Http\Client\ClientInterface;

// After
namespace MyPlugin\Dependencies\GuzzleHttp;
use MyPlugin\Dependencies\Psr\Http\Client\ClientInterface;
```

All `use` statements, type hints, and string references in `class_exists()` calls are updated together.

## Automating With Composer Scripts

```json
{
  "scripts": {
    "post-install-cmd": ["mozart compose"],
    "post-update-cmd": ["mozart compose"]
  }
}
```

Mozart runs automatically after every `composer install` or `composer update`.

## Using the Prefixed Code in Your Plugin

After Mozart processes dependencies, load its generated autoloader instead of the original vendor one:

```php
// plugin.php
require_once __DIR__ . '/vendor-prefixed/autoload.php';

// Then use normally — the prefixed version loads transparently
use MyPlugin\Dependencies\GuzzleHttp\Client;

$client = new Client();
```

## Classes Without Namespaces

Some older packages don't use namespaces:

```php
// Before
class Container { ... }
```

Mozart prefixes the class name:

```php
// After
class MyPlugin_Container { ... }
```

All `new Container()` call sites are updated to `new MyPlugin_Container()` as well.

## Limitations

**Dynamic class names**: Mozart can't track this pattern:

```php
$class = 'GuzzleHttp\\Client';
$obj = new $class();  // not rewritten
```

**Mozart's own dependencies**: Mozart itself uses libraries. Requiring it directly into your project can cause the same conflicts you're trying to solve — hence the Docker or PHAR recommendation.

**Ecosystem shift**: Mozart is still maintained (latest: 1.1.3), but many developers have moved to [Strauss](/en/p/strauss-composer-prefix/), a fork that addresses a few known Mozart limitations — better constant prefixing, full `files` autoloader support, and license compliance handling.

## Summary

There's no official WordPress solution for dependency conflicts. Mozart is the most direct approach: copy dependencies, prefix namespaces, make your classes completely distinct from everyone else's.

If you run into Mozart's limitations — constant prefixing, file autoloaders, license headers — [Strauss](/en/p/strauss-composer-prefix/) is worth a look.

## References

- [Mozart GitHub Repository](https://github.com/coenjacobs/mozart) — Source code and full configuration documentation
- [Strauss: The Mozart Fork](https://github.com/BrianHenryIE/strauss) — Drop-in replacement that addresses known Mozart limitations
- [Composer Docs: the extra field](https://getcomposer.org/doc/04-schema.md#extra) — How to configure tools via composer.json extra
- [WordPress Plugin Development: Best Practices](https://developer.wordpress.org/plugins/plugin-basics/best-practices/) — Official WordPress plugin development guidelines
