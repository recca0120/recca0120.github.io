---
title: Laravel Eloquent Memory Leak
slug: laravel-eloquent-memory-leak
date: '2020-06-18T14:00:42+08:00'
categories:
- laravel
tags:
- laravel
- eloquent
draft: false
---
從[這篇討論串](https://laracasts.com/discuss/channels/laravel/laravel-58-memory-leak)可以看出 Eloquent 用 property 去取得 relation 時是會造成 memory leak 的這在大型資料運算的時候會給系統造成很大負擔的，不得不小心，但在這討論串中有找出解決方案，所以直接節錄解決方案

```php
$users = User::with('posts')->get();

foreach ($users as $user) {
    $posts = $user->posts;
    // 增加這行即可
    $user->setRelations([]);
    // 討論串有提到這一行，但提問者測試好像無效
    // $user->setRelation('posts', null);
}
```