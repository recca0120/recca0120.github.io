---
title: 'Fish Shell + Laravel Valet: Auto-Switch PHP Versions and Composer v1/v2'
date: '2026-03-20T09:00:00+08:00'
slug: fish-valet-php-composer
image: featured.jpg
description: 'Use fish shell aliases and functions to make php, composer, and phpunit automatically follow Laravel Valet PHP versions. Handles legacy projects requiring Composer v1 with smart composer.phar detection.'
categories:
  - PHP
  - Tools
tags:
  - fish
  - laravel
  - valet
  - php
  - composer
  - shell
  - version-manager
---

Managing multiple PHP versions with Laravel Valet is great — until you type `php -v` and get the global version instead of the one Valet set for that directory.
Legacy projects that need Composer v1 don't play well with the v2 you have globally.
A few lines of fish config fix both. `php`, `composer`, and `phpunit` all follow Valet automatically.

## The Problem

Valet's `valet php` command runs PHP using the version configured for the current directory. But typing `php` directly uses the system-wide PHP — completely unrelated to Valet.

Composer is worse: some older packages are incompatible with Composer v2 and need v1 to install. You can't downgrade your whole system's Composer for one legacy project. The workaround is dropping a `composer.phar` (v1) in the project directory — but then you have to remember to type `php ./composer.phar` every time. Annoying.

## The Fish Config

Add this to `~/.config/fish/config.fish`:

```fish
# php uses Valet's version, auto-switches per directory
alias php "valet php"

# phpunit follows Valet's php
alias phpunit "php vendor/bin/phpunit"

# composer: smart v1/v2 detection
function composer
    if [ -n "./composer.phar" ]
        # Project has a composer.phar (v1) — use it, remove memory limit
        COMPOSER_MEMORY_LIMIT=-1 valet php ./composer.phar $argv
    else
        # No composer.phar — use system valet composer (v2)
        valet composer $argv
    end
end
```

Run `source ~/.config/fish/config.fish` or restart your terminal to apply.

## What Each Line Does

### `alias php "valet php"`

`valet php` picks the PHP version based on the current directory's `.valetphprc` or Valet's per-directory configuration. With this alias, `php artisan`, `php -v`, and everything else automatically uses the right version — no manual switching.

### `alias phpunit "php vendor/bin/phpunit"`

PHPUnit is a PHP script, so which PHP runs it matters. This alias ensures phpunit uses `php` (which is now `valet php`), keeping it in sync with the project's PHP version.

### `function composer`

This function solves Composer v1/v2 coexistence:

```fish
function composer
    if [ -n "./composer.phar" ]
        COMPOSER_MEMORY_LIMIT=-1 valet php ./composer.phar $argv
    else
        valet composer $argv
    end
end
```

`[ -n "./composer.phar" ]` checks whether `composer.phar` exists in the current directory. If it does, use it (v1); otherwise fall back to `valet composer` (v2).

`COMPOSER_MEMORY_LIMIT=-1` removes the memory cap. Composer v1 runs out of memory easily on complex dependency trees. v2 is far more efficient and rarely needs this.

`$argv` passes all arguments through, so `composer install`, `composer require laravel/framework`, and everything else works normally.

## Setting Up a Legacy Project for Composer v1

When you hit a project that needs v1, download `composer.phar` into the project root:

```bash
# Download the latest Composer v1
curl -o composer.phar https://getcomposer.org/download/latest-1.x/composer.phar
chmod +x composer.phar

# Don't commit it
echo "composer.phar" >> .gitignore
```

From that point on, `composer install` in that directory automatically uses v1. Every other project without a `composer.phar` continues using v2. They don't interfere with each other.

## Verifying the Setup

```bash
# Check that php follows Valet
php -v
# Should show the PHP version configured for this directory

# Check that the composer function is active
type composer
# Output: composer is a function with definition ...

# In a directory with composer.phar
cd ~/Sites/legacy-project
composer --version
# Output: Composer version 1.x.x

# In a normal directory
cd ~/Sites/modern-project
composer --version
# Output: Composer version 2.x.x
```

## Summary

The core idea: let development tools follow Valet's PHP version automatically instead of managing it manually. `php` and `phpunit` are simple aliases. `composer` needs a function because of the v1/v2 coexistence requirement.

Dropping `composer.phar` in a project root acts as a flag — "this project needs v1." No extra config files, no environment variables, just a file that's already there for a reason.

## References

- [Fish Shell Official Documentation](https://fishshell.com/docs/current/index.html)
- [Laravel Valet Official Documentation](https://laravel.com/docs/valet)
- [Composer Official Download Page (all versions including phar)](https://getcomposer.org/download/)
- [Fish Shell function command reference](https://fishshell.com/docs/current/cmds/function.html)
