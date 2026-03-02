---
title: 用 Blade 來 Render Markdown
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

## 想法

用 Markdown 寫文件很方便，如果文件裡能嵌入 Blade 語法（像是 `@include` 或變數）就更好了。Laravel 的 Blade 引擎支援自訂副檔名，可以把 `.md` 檔也丟給 Blade 處理。

## 做法

### 安裝 Markdown 套件

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
        // 讓 .md 檔用 Blade 引擎處理
        $this->viewFactory->addExtension('md', 'blade');
    }

    public function index() {
        $environment = Environment::createGFMEnvironment();
        $converter = new CommonMarkConverter([
            'allow_unsafe_links' => false,
        ], $environment);

        // 先經過 Blade 編譯，再轉成 HTML
        return $converter->convertToHtml($this->viewFactory->make('demo.md'));
    }
}
```

流程是：Blade 先處理 `demo.md` 裡的變數和指令，輸出純 Markdown 字串，再交給 CommonMark 轉成 HTML。
