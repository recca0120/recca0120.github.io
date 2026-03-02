---
title: 'Blade 重複 HTML 區塊的 3 種消除方法'
description: 'Blade template 出現重複的 HTML 區塊時，可選 @include、Component 或 ob_start 三種做法，各有適用場景，其中 ob_start 不需要額外建立檔案。'
slug: laravel-blade-template
date: '2024-05-07T07:47:27+08:00'
categories:
- Laravel
tags:
- Laravel
- Blade
image: featured.png
draft: false
---

Blade template 裡出現重覆的 HTML 區塊時，有幾種方式可以消除重覆。

假設原本的 template 長這樣：

```blade
<div>
  Hello World
</div>

this is content

<div>
  Hello World
</div>
```

## 方法一：@include directive

建立 `hello-world.blade.php`：

```blade
<div>
  Hello World
</div>
```

用 `@include` 載入：

```blade
@include('hello-world')

this is content

@include('hello-world')
```

## 方法二：Component

建立 `components/hello-world.blade.php`：

```blade
<div>
  Hello World
</div>
```

用 `<x-hello-world />` 載入：

```blade
<x-hello-world />

this is content

<x-hello-world />
```

## 方法三：ob_start

```blade
@php(ob_start())
<div>
 Hello World
</div>
@php($hello = ob_get_clean())

{!! $hello !!}

this is content

{!! $hello !!}
```

前兩個是 Laravel 官方內建的做法，但都需要把重覆區塊移到新檔案。第三個方法利用 `ob_start` 把輸出存進 buffer 再取出，不需要額外建檔，適合那種只在單一 template 內重覆、不值得獨立成檔案的情況。
