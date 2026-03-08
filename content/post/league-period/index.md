---
title: 'League Period：PHP 時間區間處理的瑞士刀'
date: '2026-04-06T09:00:00+08:00'
slug: league-period
description: '用原生 DateTime 比較兩個時間區間是否重疊，要寫一堆 if 判斷。League Period 用不可變物件封裝時間區間，內建重疊、包含、間隙、交集等操作，一行搞定。'
categories:
  - PHP
tags:
  - php
  - period
  - datetime
  - league
---

你有沒有寫過這種程式碼：判斷兩個時間區間是否重疊？

```php
if ($startA < $endB && $startB < $endA) {
    // 有重疊
}
```

看起來簡單，但加上邊界條件（含不含端點？）、多個區間（三個以上怎麼辦？）、找間隙（哪些時段沒被涵蓋？），程式碼就會爆炸。

[League Period](https://period.thephpleague.com/) 把時間區間封裝成不可變的值物件，重疊、包含、間隙、交集全部內建，不用自己寫邏輯。

## 安裝

```bash
composer require league/period
```

需要 PHP 8.1+。

## 建立時間區間

### 從日期建立

```php
use League\Period\Period;

// 最基本：指定起點和終點
$meeting = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30');

// 預設行為是 [start, end)，包含起點、不包含終點
```

### 從日曆單位建立

```php
// 2026 年 4 月整個月
$april = Period::fromMonth(2026, 4);

// 2026 年第一季
$q1 = Period::fromQuarter(2026, 1);

// 2026 年整年
$year = Period::fromYear(2026);

// 2026 年第 15 週（ISO week）
$week = Period::fromIsoWeek(2026, 15);

// 某一天
$day = Period::fromDay(2026, 4, 6);
```

不用自己算「4 月有幾天」或「這一季從哪天開始」，Period 全部幫你處理。

### 從時間點 + 時長建立

```php
// 從某個時間點往後 2 小時
$slot = Period::after('2026-04-06 14:00', '2 HOURS');

// 從某個時間點往前 30 分鐘
$before = Period::before('2026-04-06 14:00', '30 MINUTES');

// 以某個時間點為中心，前後各 1 小時
$around = Period::around('2026-04-06 14:00', '1 HOUR');
```

## 邊界控制

預設是 `[start, end)`（包含起點、不包含終點），可以改：

```php
use League\Period\Bounds;

// 包含兩端
$closed = Period::fromDate('2026-04-01', '2026-04-30', Bounds::IncludeAll);

// 排除兩端
$open = Period::fromDate('2026-04-01', '2026-04-30', Bounds::ExcludeAll);

// 排除起點、包含終點
$leftOpen = Period::fromDate('2026-04-01', '2026-04-30', Bounds::ExcludeStartIncludeEnd);
```

訂房系統常用 `[checkin, checkout)`：入住日算在內，退房日不算。會議室預約也是。

## 包含判斷

```php
$workday = Period::fromDate('2026-04-06 09:00', '2026-04-06 18:00');

// 某個時間點是否在區間內
$workday->contains('2026-04-06 12:00');  // true
$workday->contains('2026-04-06 20:00');  // false

// 某個區間是否完全在另一個區間內
$lunch = Period::fromDate('2026-04-06 12:00', '2026-04-06 13:00');
$workday->contains($lunch);  // true
```

## 重疊判斷

```php
$meetingA = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30');
$meetingB = Period::fromDate('2026-04-06 10:00', '2026-04-06 11:30');
$meetingC = Period::fromDate('2026-04-06 11:00', '2026-04-06 12:00');

$meetingA->overlaps($meetingB);  // true（10:00-10:30 重疊）
$meetingA->overlaps($meetingC);  // false（不重疊）
```

不用自己寫 `if ($startA < $endB && $startB < $endA)` 了。

## 比較操作

Period 提供 Allen's Interval Algebra 的 13 種關係：

```php
$a->meets($b);        // a 的終點 = b 的起點（緊接）
$a->overlaps($b);     // 有重疊
$a->contains($b);     // a 完全包含 b
$a->isDuring($b);     // a 在 b 裡面（contains 的反向）
$a->equals($b);       // 完全相同
$a->abuts($b);        // 緊鄰（meets 或 metBy）
$a->bordersOnStart($b);
$a->bordersOnEnd($b);
```

## 修改操作（不可變）

Period 是不可變物件，所有修改都回傳新物件：

```php
$original = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:00');

// 延長結束時間
$extended = $original->endingOn('2026-04-06 11:00');

// 移動起點
$moved = $original->startingOn('2026-04-06 08:30');

// 擴展（前後各加 30 分鐘）
$expanded = $original->expand('30 MINUTES');

// 移動整個區間（保持長度不變）
$shifted = $original->move('1 HOUR');
```

`$original` 不受影響，這在傳來傳去的時候很安全。

## 區間分割與迭代

```php
$april = Period::fromMonth(2026, 4);

// 按天迭代
foreach ($april->dateRange('1 DAY') as $day) {
    echo $day->format('Y-m-d') . "\n";
}

// 把一個月切成每週
foreach ($april->splitForward('1 WEEK') as $week) {
    echo $week->toIso80000('Y-m-d') . "\n";
}
```

## Sequence：多個區間的集合操作

這是 Period 最強大的部分。當你有一組時間區間，需要找間隙、交集、聯集：

```php
use League\Period\Sequence;

$sequence = new Sequence(
    Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30'),  // 會議 A
    Period::fromDate('2026-04-06 11:00', '2026-04-06 12:00'),  // 會議 B
    Period::fromDate('2026-04-06 14:00', '2026-04-06 15:30'),  // 會議 C
);
```

### 找間隙（gaps）

「今天哪些時段是空的？」

```php
$gaps = $sequence->gaps();
// 10:30-11:00, 12:00-14:00
```

排班系統、會議室可用時段、醫生看診空檔——都是 `gaps()` 一行搞定。

### 找交集（intersections）

「哪些時段有兩個以上的會議重疊？」

```php
$overlaps = $sequence->intersections();
```

### 排序

```php
$sorted = $sequence->sorted(fn (Period $a, Period $b) => $a->startDate <=> $b->startDate);
```

## 實際應用場景

### 會議室衝突檢測

```php
function hasConflict(Period $newBooking, Sequence $existing): bool
{
    foreach ($existing as $booking) {
        if ($newBooking->overlaps($booking)) {
            return true;
        }
    }
    return false;
}
```

### 可用時段查詢

```php
function getAvailableSlots(Period $workday, Sequence $meetings): Sequence
{
    return $meetings->gaps();
}

$workday = Period::fromDate('2026-04-06 09:00', '2026-04-06 18:00');
$meetings = new Sequence(
    Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30'),
    Period::fromDate('2026-04-06 14:00', '2026-04-06 15:00'),
);

$available = getAvailableSlots($workday, $meetings);
// 10:30-14:00, 15:00-18:00
```

### 報表：按月統計

```php
$year = Period::fromYear(2026);

foreach ($year->splitForward('1 MONTH') as $month) {
    $orders = getOrdersInPeriod($month);
    echo $month->startDate->format('Y-m') . ': ' . count($orders) . " 筆\n";
}
```

## 格式化輸出

```php
$period = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30');

// ISO 8601
echo $period;
// 2026-04-06T09:00:00+08:00/2026-04-06T10:30:00+08:00

// ISO 80000（數學記號）
echo $period->toIso80000('Y-m-d H:i');
// [2026-04-06 09:00, 2026-04-06 10:30)

// JSON
echo json_encode($period);
```

## 小結

用原生 `DateTime` 處理時間區間的邏輯，容易寫、難除錯、更難維護。League Period 把這些操作封裝成清楚的 API：

- 建立區間不用算天數
- 重疊判斷不用自己寫條件
- `Sequence` 的 `gaps()` / `intersections()` 解決排班、預約、報表的常見需求
- 不可變設計，傳來傳去不怕被改到

適合任何需要處理「一段時間」的場景：預約系統、排班、報表、活動日期、合約有效期。
