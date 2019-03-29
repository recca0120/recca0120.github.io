---
title: Eloquent 計算關聯數量
urlname: eloquent-relation-counts
comments: true
author: recca0120
tags:
  - eloquent
  - laravel
  - relation
  - count
categories:
  - laravel
abbrlink: 480739d0
date: 2019-03-27 11:14:00
---
假設我們有這兩個 Model

```php

use Illuminate\Database\Eloquent\Model;

class Post extends Model 
{
	public function comments()
    {
    	return $this->hasMany(Comment::class);
    }
}

class Comment extends Model
{
}
```

我們希望能計算出每篇文章的留言數，倒底應該怎麼寫比較好呢？其實 Eloquent 已經提供一個很簡單的 method `withCount`

```php
Post::withCount('comments')->get()->each(function($post) {
	echo $post->comments_count;
});
```

但如果 withCount 有 where condition 時又該如何處理呢？

```php
Post::withCount(['comments' => function($query) {
	$query->where('name', 'recca0120');
}])->get()->each(function($post) {
	echo $post->comments_count;
});
```

這樣就完成了
