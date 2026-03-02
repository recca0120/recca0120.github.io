---
title: 'PHP 解析 CSV 指數格式：用 sprintf 動態精度轉回小數'
description: 'Excel 匯出 CSV 時會把小數轉成 8.90E-05 這類指數格式，直接用 bcmul 會報錯。用 sprintf 搭配動態小數位數計算，可正確還原任意精度的浮點數。'
slug: php-csv
date: '2024-07-16T06:05:35+08:00'
categories:
- PHP
tags:
- PHP
image: featured.png
draft: false
---

從 Excel 匯出 CSV 時，數字欄位常被轉成指數格式，例如 `0.000089` 變成 `8.90E-05`。直接塞進 MySQL 沒問題，但用 `bcmul` 運算就會噴 `bcmul(): bcmath function argument is not well-formed`。

## 用 sprintf 轉回小數

最直覺的做法是用 `sprintf` 把指數轉回 float：

```php
echo sprintf('%f', '8.90E-05'); // 輸出 0.000089
```

但小數點位數超過 6 位時就會出問題：

```php
echo sprintf('%f', '8.90E-12'); // 輸出 0.000000
```

`%f` 預設只保留 6 位小數，超過的部分直接被截掉了。

## 動態計算小數位數

從指數的 `E-` 後面取出位數，動態調整 `sprintf` 的精度：

```php
function toFloat($number) {
    if (preg_match('/E-(\d+)/', (string) $number, $matched)) {
        $length = max(5, ((int) $matched[1]) + 1);

        return sprintf('%.'.$length.'f', $number);
    }

    return sprintf('%f', $number);
}

echo toFloat('8.90E-12'); // 輸出 0.0000000000089
```

這樣不管小數點位數多長都能正確轉換。
