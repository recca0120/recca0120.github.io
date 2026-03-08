---
title: '3 Ways to Eliminate Duplicate HTML Blocks in Blade Templates'
description: 'When Blade templates have repeating HTML, choose from @include, Component, or ob_start. ob_start is the only option that requires no additional template files.'
slug: laravel-blade-template
date: '2024-05-07T07:47:27+08:00'
categories:
- Laravel
tags:
- Laravel
- Blade
image: featured.jpg
draft: false
---

When duplicate HTML blocks appear in a Blade template, there are several ways to eliminate the repetition.

Suppose the original template looks like this:

```blade
<div>
  Hello World
</div>

this is content

<div>
  Hello World
</div>
```

## Method 1: @include Directive

Create `hello-world.blade.php`:

```blade
<div>
  Hello World
</div>
```

Use `@include` to load it:

```blade
@include('hello-world')

this is content

@include('hello-world')
```

## Method 2: Component

Create `components/hello-world.blade.php`:

```blade
<div>
  Hello World
</div>
```

Use `<x-hello-world />` to load it:

```blade
<x-hello-world />

this is content

<x-hello-world />
```

## Method 3: ob_start

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

The first two are official Laravel approaches, but both require extracting the duplicate block into a separate file. The third method uses `ob_start` to capture the output into a buffer, then retrieves it -- no extra file needed. It's suitable for blocks that only repeat within a single template and aren't worth extracting into their own file.
