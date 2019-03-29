---
title: 如何利用 git 升級 Laravel
urlname: git-strategy-for-laravel-upgrade
comments: true
author: recca0120
tags:
  - laravel
  - upgrade
categories:
  - laravel
abbrlink: 5951f752
date: 2019-03-28 11:36:00
---
每次 Laravel 升級時都非常頭痛，必須去比較每個檔案的差異，費時又費工，而且還有可能漏改檔案。
但我們都知道 git 就有檔案比較的功能，所以就可以利用 git 來升級囉！

```bash
# 先切換到新分支
git checkout -b upgrade

# 加入 Laravel
git remote add laravel git@github.com:laravel/laravel.git

# 將遠端 Laravel 抓回本地端
git fetch laravel

# 合併 Laravel 新版本，並捨棄 Laravel 的修改記錄
git merge v5.8.3 --squash --allow-unrelated-histories

# 有衝穾就處理衝突並 git add 修改的檔案

# 切回主分支
git checkout master

# 合併分支
git merge upgrade

# 最後記得執行 composer update
composer update
```