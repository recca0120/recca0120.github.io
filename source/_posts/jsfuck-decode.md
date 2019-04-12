title: jsfuck decode
urlname: jsfuck decode
comments: true
author: recca0120
abbrlink: 22132
categories:
  - javascript
tags:
  - jsfuck
  - jsunfuck
  - decode
date: 2019-04-12 14:00:00
---
## 前言

在『參考』別人的 javascript，發現了這樣的程式碼

```js
[(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+
(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+
(!![]+[])[+!+[]]]
```

真的是令人恨的牙癢癢的，為了好好的參考別人寫好的 javascript，逼不得已只好努力的找 decode 的方案了

## 它是什麼？

在 decode 之前也得先知道這是什麼，所以就 google 了一下，發現它就是 [jsfuck](http://www.jsfuck.com/)，一種 obfuscation，它的運作原理可參考[這裡](https://blog.techbridge.cc/2016/07/16/javascript-jsfuck-and-aaencode/)，就不再詳加敘述了。

## 如何 Decode ？

到這篇的重點了，要如何還原程式碼！
其實很簡單，只要 hook function constructor 這可以輕易的還原。

```js
Function.prototype.__defineGetter__('constructor', function() {
	return function(...args) {
		console.log('code:', ...args);
		return Function(...args);
	};
});
```

接下來就可以好好的參考原始碼了