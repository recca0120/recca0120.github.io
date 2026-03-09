---
title: 用 Blade 引擎 Render Markdown 並嵌入動態語法
description: '透過 Blade addExtension 讓 .md 檔支援 @include 和變數，再交給 CommonMark 轉成 HTML，適合需要動態內容的文件系統。'
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

## 想法

用 Markdown 寫文件很方便，如果文件裡能嵌入 Blade 語法（像是 `@include` 或變數）就更好了。Laravel 的 Blade 引擎支援自訂副檔名，可以把 `.md` 檔也丟給 Blade 處理。

## 做法

### 安裝 Markdown 套件

安裝 [league/commonmark](https://github.com/thephpleague/commonmark)：

```bash
composer require league/commonmark
```

### Controller

以下範例使用 league/commonmark v2（v1 的 API 不同）：

```php
use Illuminate\View\Factory;
use League\CommonMark\GithubFlavoredMarkdownConverter;

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
        $converter = new GithubFlavoredMarkdownConverter([
            'allow_unsafe_links' => false,
        ]);

        // 先經過 Blade 編譯，再轉成 HTML
        return $converter->convert($this->viewFactory->make('demo.md'));
    }
}
```

流程是：Blade 先處理 `demo.md` 裡的變數和指令，輸出純 Markdown 字串，再交給 CommonMark 轉成 HTML。

## 參考資源

- [league/commonmark 官方文件](https://commonmark.thephpleague.com/)
- [league/commonmark GitHub 倉庫](https://github.com/thephpleague/commonmark)
- [Laravel Blade 模板引擎文件](https://laravel.com/docs/blade)
- [GithubFlavoredMarkdownConverter 說明](https://commonmark.thephpleague.com/2.4/extensions/github-flavored-markdown/)

