---
title: 'PHP CSV: Convert Scientific Notation Back to Decimal'
description: 'Excel exports small decimals as 8.90E-05 scientific notation in CSV, breaking bcmul. Use sprintf with dynamic precision from the exponent to restore any float.'
slug: php-csv
date: '2024-07-16T06:05:35+08:00'
categories:
- PHP
tags:
- PHP
image: featured.png
draft: false
---

When exporting CSV from Excel, numeric fields are often converted to scientific notation — e.g., `0.000089` becomes `8.90E-05`. Inserting into MySQL works fine, but using `bcmul` throws `bcmul(): bcmath function argument is not well-formed`.

## Convert Back with sprintf

The most straightforward approach is using `sprintf` to convert scientific notation back to a float:

```php
echo sprintf('%f', '8.90E-05'); // 輸出 0.000089
```

But it breaks when the decimal places exceed 6:

```php
echo sprintf('%f', '8.90E-12'); // 輸出 0.000000
```

`%f` defaults to 6 decimal places, and anything beyond that gets truncated.

## Dynamically Calculate Decimal Places

Extract the exponent from `E-` and dynamically adjust the `sprintf` precision:

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

This correctly converts the number regardless of how many decimal places it has.
