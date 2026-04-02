---
title: 'Strauss: The Better Mozart for WordPress Plugin Dependency Isolation'
date: '2026-04-05T09:00:00+08:00'
slug: strauss-composer-prefix
description: "Strauss is a Composer dependency prefixing tool forked from Mozart. It fixes Mozart's known limitations: full files autoloader support, constant prefixing, license compliance, and zero-config defaults. The modern choice for WordPress plugin dependency isolation."
categories:
  - PHP
tags:
  - strauss
  - composer
  - wordpress
  - php
  - namespace
---

If you've read the [Mozart](/en/p/mozart-composer-prefix/) overview, you know what problem it solves: WordPress plugins share a PHP process, two plugins using different versions of the same library causes fatal errors, and Mozart prefixes your vendor namespaces to isolate them.

[Strauss](https://github.com/BrianHenryIE/strauss) was forked from Mozart to address several of its known limitations. It's what the community generally recommends now.

## What Strauss Changed

| Issue | Mozart | Strauss |
|---|---|---|
| `files` autoloader support | Limited | Full |
| Constant prefixing (`define()`) | Not supported | Supported |
| Function prefixing | Not supported | v0.21.0+ |
| License compliance | Questionable | Header edits + license files preserved |
| Destructive defaults | Can delete files | Non-destructive by default |
| Zero config | Requires setup | Works out of the box |
| Test coverage | Limited | Comprehensive PHPUnit tests |

## Installation

### Recommended: PHAR

```bash
mkdir bin && touch bin/.gitkeep
```

Add to `.gitignore`:

```
bin/strauss.phar
```

Add to `composer.json` scripts:

```json
{
  "scripts": {
    "prefix-namespaces": [
      "sh -c 'test -f ./bin/strauss.phar || curl -o bin/strauss.phar -L -C - https://github.com/BrianHenryIE/strauss/releases/latest/download/strauss.phar'",
      "@php bin/strauss.phar",
      "@composer dump-autoload"
    ],
    "post-install-cmd": ["@prefix-namespaces"],
    "post-update-cmd": ["@prefix-namespaces"]
  }
}
```

Downloads the PHAR on first run, uses the cached version after.

### Or Require Directly

```bash
composer require --dev brianhenryie/strauss
```

## Configuration

Strauss works with zero configuration — it infers the namespace prefix and target directory from your `composer.json` automatically.

To customize, add `extra.strauss`:

```json
{
  "extra": {
    "strauss": {
      "target_directory": "vendor-prefixed",
      "namespace_prefix": "MyPlugin\\Vendor\\",
      "classmap_prefix": "MyPlugin_",
      "constant_prefix": "MYPLUGIN_",
      "packages": [
        "guzzlehttp/guzzle"
      ],
      "exclude_from_copy": {
        "packages": ["psr/container"],
        "namespaces": ["Psr\\Log\\"],
        "file_patterns": ["\\.md$"]
      },
      "exclude_from_prefix": {
        "namespaces": ["Psr\\"]
      }
    }
  }
}
```

| Option | Purpose |
|---|---|
| `target_directory` | Where processed files go (default: `vendor-prefixed`) |
| `namespace_prefix` | Prefix added to namespaces |
| `classmap_prefix` | Prefix for classes without namespaces |
| `constant_prefix` | Prefix for `define()` constants |
| `exclude_from_copy` | Packages, namespaces, or file patterns to skip entirely |
| `exclude_from_prefix` | Copy but don't prefix (e.g. PSR interfaces) |

## Running

```bash
composer prefix-namespaces
```

Or directly:

```bash
php bin/strauss.phar
```

Dry run to preview changes without writing:

```bash
php bin/strauss.phar --dry-run
```

## Constant Prefixing

Mozart doesn't handle `define()`. Strauss does:

```php
// In your dependency
define('GUZZLE_VERSION', '7.0');

// After Strauss
define('MYPLUGIN_GUZZLE_VERSION', '7.0');
```

Constants are global just like classes — they conflict the same way. This matters for certain packages.

## files Autoloader Support

Some packages use `files` autoloaders (direct `require` instead of PSR-4). Mozart handles these inconsistently. Strauss processes them fully:

```json
// Package's composer.json
"autoload": {
    "files": ["src/functions.php"]
}
```

Strauss copies and prefixes these files without missing anything.

## Loading in Your Plugin

```php
// plugin.php
require_once __DIR__ . '/vendor-prefixed/autoload.php';

use MyPlugin\Vendor\GuzzleHttp\Client;

$client = new Client();
```

Or have Strauss inject the autoloader into `vendor/autoload.php`:

```bash
php bin/strauss.phar include-autoloader
```

Then you only need `require vendor/autoload.php` — no separate require for `vendor-prefixed/`.

## License Compliance

Strauss adds a note to each modified file's header and preserves original license files. Mozart's handling of this is questionable — open source licenses typically require retaining original attribution. Strauss deals with it properly.

## Mozart Configuration Compatibility

If you're currently using Mozart, Strauss reads `extra.mozart` config directly. No need to migrate immediately:

```json
{
  "extra": {
    "mozart": {
      "dep_namespace": "MyPlugin\\Dependencies\\"
    }
  }
}
```

Strauss recognizes and applies it automatically.

## Mozart or Strauss?

New project: use Strauss.

Existing Mozart project, consider migrating if:
- Your dependencies use `files` autoloaders
- You need `define()` constant prefixing
- License compliance matters
- You need function prefixing (v0.21.0+)

Migration cost is low — Strauss reads Mozart config, so it's mostly updating the scripts section.

## Summary

Strauss and Mozart solve the same problem: WordPress plugin dependency conflicts. The difference is in the details: more complete autoloader support, constant prefixing, proper license handling, and safer defaults.

Start new plugins with Strauss. Migrate existing Mozart setups when you hit a limitation.

## References

- [Strauss GitHub Repository](https://github.com/BrianHenryIE/strauss)
- [Composer Official Documentation](https://getcomposer.org/doc/)
- [WordPress Plugin Developer Handbook](https://developer.wordpress.org/plugins/plugin-basics/)
- [Mozart GitHub Repository (Strauss predecessor)](https://github.com/coenjacobs/mozart)
