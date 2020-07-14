title: 用 Blade 來 Render Markdown
urlname: render-markdown-by-blade-template-engine
comments: true
tags:
  - laravel
  - blade
  - markdown
categories:
  - laravel
author: recca0120
abbrlink: 38394
date: 2020-07-14 09:49:36
updated: 2020-07-14 09:49:36
keywords:
description:
---
用 markdown 來寫文件是一個超級便利的事情，如果能再加上 Laravel 的 Blade 就更棒了，好在 Blade 可以做這件事，兩個願望一次達成啊


## How to

### 安裝 markdown 套件

```bash
composer require league/commonmark
```

### Render Markdown

```php

use Illuminate\View\Factory;
use League\CommonMark\CommonMarkConverter;
use League\CommonMark\Environment;

class DocsController extends Controller
{
    /**
     * @var Factory
     */
    private $viewFactory;
    
    public function __construct(Factory $viewFactory)
    {
        $this->viewFactory = $viewFactory;
        // 設定 md 的副檔名用 blade engine render
        $this->viewFactory->addExtension('md', 'blade');
    }
    
    public function index() {
        $environment = Environment::createGFMEnvironment();

        $converter = new CommonMarkConverter([
            'allow_unsafe_links' => false,
        ], $environment);
        
        // 透過 blade engine 及 markdown parser 做轉換
        return $converter->convertToHtml($this->viewFactory->make('demo.md'));
    }
}
```