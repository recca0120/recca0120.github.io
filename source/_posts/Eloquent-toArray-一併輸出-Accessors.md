title: Eloquent toArray 一併輸出 Accessors
urlname: eloquent-accessors-to-array
alias: laravel/eloquent-mutators-to-array.html
comments: true
author: recca0120
tags:
  - php
  - laravel
  - eloquent
  - mutator
  - accessor
categories:
  - laravel
abbrlink: 59202
date: 2019-03-31 15:43:00
---
## 前言

定義 Eloquent Model 的時候，會增加 accessors (即 getXXXAttribute)，但會發現執行 `toArray` 時，accessors 不會一併被輸出，就來解決一下這個問題吧


## 問題描述

### 定義 User Model

```php
use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    protected $fillable = ['firstname', 'lastname', 'birthday'];

    public function getNameAttribute() {
        return implode(' ', [$this->attributes['firstname'], $this->attributes['lastname']]);
    }

    public function getAgeAttribute() {
        return date('Y') - date('Y', strtotime($this->attributes['birthday']));
    }
}
```

### 執行結果

```php
$user = new User([
    'firstname' => 'recca0120',
    'lastname' => 'tsai',
    'birthday' => '1980-01-20',
]);

var_dump($user->toArray());
/*
`toArray` 會發現只輸出 firstname, lastname, birthday
[
	'firstname' => 'recca0120',
    'lastname' => 'tsai',
    'birthday' => '1980-01-20',
];
*/
```

## 解決方法

### User 物件解決方法

那要連同 name 及 age 也一同輸出時該如何處理呢？只要使用 `append` 或者 `setAppends` 即可。

```php
$user->append('name')->append('age')->toArray();

// or
$user->setAppends(['name', 'age'])->toArray();
```


### Collection 物件解決方法
遇到 collection 的時候該如何處理呢？

```php
User::all()->each(function($user) {
	$user->setAppends(['name', 'age']);
});
```

但 collection 其實有 [Higher Order Messaging](https://laravel-news.com/higher-order-messaging) 可以使用，所以程式碼可以簡化成

```php
User::all()->each->setAppends(['name', 'age'])->toArray();
```

最後附上可執行的[範例](https://implode.io/ffbHSS?fbclid=IwAR3K5o_-MsyPMOEDsG8G7xHRV_0-W8M9x2VRM7eaCL5uvE4otEImoUw4SEc)