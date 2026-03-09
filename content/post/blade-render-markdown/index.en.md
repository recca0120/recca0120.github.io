---
title: Render Markdown with Blade and Embed Dynamic Syntax
description: 'Use Blade addExtension to make .md files support @include and variables, then pass the output through CommonMark to generate HTML for dynamic documentation.'
slug: render-markdown-by-blade-template-engine
date: '2020-07-14T09:49:36+08:00'
categories:
- Laravel
- PHP
tags:
- Laravel
- Blade
- Composer
- CommonMark
draft: false
image: featured.jpg
---

## The Idea

Writing documentation in Markdown is convenient. It would be even better if you could embed Blade syntax (like `@include` or variables) inside the Markdown files. Laravel's Blade engine supports custom file extensions, so you can have it process `.md` files as well.

## Implementation

### Install a Markdown Package

Install [league/commonmark](https://github.com/thephpleague/commonmark):

```bash
composer require league/commonmark
```

### Controller

The example below uses league/commonmark v2 (v1 has a different API):

```php
use Illuminate\View\Factory;
use League\CommonMark\GithubFlavoredMarkdownConverter;

class DocsController extends Controller
{
    private $viewFactory;

    public function __construct(Factory $viewFactory)
    {
        $this->viewFactory = $viewFactory;
        // Let .md files be processed by the Blade engine
        $this->viewFactory->addExtension('md', 'blade');
    }

    public function index() {
        $converter = new GithubFlavoredMarkdownConverter([
            'allow_unsafe_links' => false,
        ]);

        // First compile through Blade, then convert to HTML
        return $converter->convert($this->viewFactory->make('demo.md'));
    }
}
```

The flow is: Blade first processes the variables and directives in `demo.md`, outputs a plain Markdown string, then CommonMark converts it to HTML.

## References

- [league/commonmark Official Documentation](https://commonmark.thephpleague.com/)
- [league/commonmark on GitHub](https://github.com/thephpleague/commonmark)
- [Laravel Blade Templates Documentation](https://laravel.com/docs/blade)
- [GitHub Flavored Markdown Extension for CommonMark](https://commonmark.thephpleague.com/2.4/extensions/github-flavored-markdown/)

