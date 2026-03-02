---
title: Laravel Eloquent Memory Leak
slug: laravel-eloquent-memory-leak
date: '2020-06-18T14:00:42+08:00'
categories:
- Laravel
tags:
- Laravel
- Eloquent
draft: false
image: featured.png
---

## 問題

在處理大量資料時，用 Eloquent 的 property 取 relation 會造成記憶體不斷攀升。原因是每個 Model 實例會把載入過的 relation 快取在自己身上，跑完一輪迴圈後這些物件都還留在記憶體裡。

這個問題在 [Laracasts 討論串](https://laracasts.com/discuss/channels/laravel/laravel-58-memory-leak)有人回報過，也有人找到了解法。

## 解法

用完 relation 之後，手動呼叫 `setRelations([])` 把快取清掉：

```php
$users = User::with('posts')->get();

foreach ($users as $user) {
    $posts = $user->posts;
    // 清除 relation 快取，釋放記憶體
    $user->setRelations([]);
}
```

討論串裡也有人提到用 `$user->setRelation('posts', null)` 只清單一 relation，但實測效果不太穩定，建議直接清全部比較保險。
