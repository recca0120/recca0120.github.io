---
title: Eloquent toArray 一併輸出 Mutators
author: recca0120
tags:
  - php
  - laravel
  - eloquent
  - mutator
  - accessors
categories:
  - laravel
  - eloquent
abbrlink: 59202
date: 2019-03-21 19:53:00
---
假設我們有一個 Post Model 

```php
use Illuminate\Support\Str;
use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $fillable = ['content'];
    
    public function getShortContentAttribute() {
        return Str::words($this->attributes['content'], 5);
    }
}
```

