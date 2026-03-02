---
title: Rendering Markdown with Blade
slug: render-markdown-by-blade-template-engine
date: '2020-07-14T09:49:36+08:00'
categories:
- Laravel
tags:
- Laravel
- Blade
- Composer
draft: false
image: featured.png
---

## The Idea

Writing documentation in Markdown is convenient. It would be even better if you could embed Blade syntax (like `@include` or variables) inside the Markdown files. Laravel's Blade engine supports custom file extensions, so you can have it process `.md` files as well.

## Implementation

### Install a Markdown Package

```bash
composer require league/commonmark
```

### Controller

```php
use Illuminate\View\Factory;
use League\CommonMark\CommonMarkConverter;
use League\CommonMark\Environment;

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
        $environment = Environment::createGFMEnvironment();
        $converter = new CommonMarkConverter([
            'allow_unsafe_links' => false,
        ], $environment);

        // First compile through Blade, then convert to HTML
        return $converter->convertToHtml($this->viewFactory->make('demo.md'));
    }
}
```

The flow is: Blade first processes the variables and directives in `demo.md`, outputs a plain Markdown string, then CommonMark converts it to HTML.
