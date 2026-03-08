---
title: 'League Period: A Swiss Army Knife for Time Intervals in PHP'
date: '2026-04-06T09:00:00+08:00'
slug: league-period
image: cover.jpg
description: "Comparing two time intervals for overlap with raw DateTime means writing a pile of if conditions. League Period wraps time intervals in immutable value objects with built-in overlap, containment, gap, and intersection operations."
categories:
  - PHP
tags:
  - php
  - period
  - datetime
  - league
  - scheduling
  - immutable
---

Have you ever written this kind of code — checking whether two time intervals overlap?

```php
if ($startA < $endB && $startB < $endA) {
    // overlap
}
```

Looks simple, but add boundary conditions (include endpoints or not?), more intervals (what about three?), and gap detection (which time slots aren't covered?), and the code explodes.

[League Period](https://period.thephpleague.com/) wraps time intervals into immutable value objects with built-in overlap, containment, gap, and intersection operations. No hand-written logic.

## Install

```bash
composer require league/period
```

Requires PHP 8.1+.

## Creating Intervals

### From Dates

```php
use League\Period\Period;

// Basic: specify start and end
$meeting = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30');

// Default is [start, end) — includes start, excludes end
```

### From Calendar Units

```php
// All of April 2026
$april = Period::fromMonth(2026, 4);

// Q1 2026
$q1 = Period::fromQuarter(2026, 1);

// Full year 2026
$year = Period::fromYear(2026);

// ISO week 15 of 2026
$week = Period::fromIsoWeek(2026, 15);

// A single day
$day = Period::fromDay(2026, 4, 6);
```

No need to figure out how many days April has or when the quarter starts — Period handles it.

### From a Point + Duration

```php
// 2 hours forward from a point
$slot = Period::after('2026-04-06 14:00', '2 HOURS');

// 30 minutes backward from a point
$before = Period::before('2026-04-06 14:00', '30 MINUTES');

// Centered on a point, 1 hour total
$around = Period::around('2026-04-06 14:00', '1 HOUR');
```

## Boundary Control

Default is `[start, end)` (include start, exclude end). You can change it:

```php
use League\Period\Bounds;

// Include both ends
$closed = Period::fromDate('2026-04-01', '2026-04-30', Bounds::IncludeAll);

// Exclude both ends
$open = Period::fromDate('2026-04-01', '2026-04-30', Bounds::ExcludeAll);

// Exclude start, include end
$leftOpen = Period::fromDate('2026-04-01', '2026-04-30', Bounds::ExcludeStartIncludeEnd);
```

Hotel booking systems often use `[checkin, checkout)` — check-in day is included, check-out day is not. Meeting room reservations work the same way.

## Containment Checks

```php
$workday = Period::fromDate('2026-04-06 09:00', '2026-04-06 18:00');

// Is a point inside the interval?
$workday->contains('2026-04-06 12:00');  // true
$workday->contains('2026-04-06 20:00');  // false

// Is one interval entirely inside another?
$lunch = Period::fromDate('2026-04-06 12:00', '2026-04-06 13:00');
$workday->contains($lunch);  // true
```

## Overlap Detection

```php
$meetingA = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30');
$meetingB = Period::fromDate('2026-04-06 10:00', '2026-04-06 11:30');
$meetingC = Period::fromDate('2026-04-06 11:00', '2026-04-06 12:00');

$meetingA->overlaps($meetingB);  // true (10:00-10:30 overlap)
$meetingA->overlaps($meetingC);  // false
```

No more writing `if ($startA < $endB && $startB < $endA)` yourself.

## Comparison Operations

Period implements Allen's Interval Algebra — 13 possible relations between two intervals:

```php
$a->meets($b);        // a ends exactly where b starts
$a->overlaps($b);     // partial overlap
$a->contains($b);     // a fully contains b
$a->isDuring($b);     // a is inside b (reverse of contains)
$a->equals($b);       // same start, end, and bounds
$a->abuts($b);        // adjacent (meets or metBy)
$a->bordersOnStart($b);
$a->bordersOnEnd($b);
```

## Modification (Immutable)

Period is immutable — all modifications return new objects:

```php
$original = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:00');

// Extend the end
$extended = $original->endingOn('2026-04-06 11:00');

// Move the start
$moved = $original->startingOn('2026-04-06 08:30');

// Expand (add 30 min before and after)
$expanded = $original->expand('30 MINUTES');

// Shift the whole interval (keep duration)
$shifted = $original->move('1 HOUR');
```

`$original` is untouched. Safe to pass around.

## Splitting and Iteration

```php
$april = Period::fromMonth(2026, 4);

// Iterate by day
foreach ($april->dateRange('1 DAY') as $day) {
    echo $day->format('Y-m-d') . "\n";
}

// Split a month into weeks
foreach ($april->splitForward('1 WEEK') as $week) {
    echo $week->toIso80000('Y-m-d') . "\n";
}
```

## Sequence: Collection Operations on Multiple Intervals

This is Period's most powerful feature. When you have a set of intervals and need to find gaps, intersections, or unions:

```php
use League\Period\Sequence;

$sequence = new Sequence(
    Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30'),  // Meeting A
    Period::fromDate('2026-04-06 11:00', '2026-04-06 12:00'),  // Meeting B
    Period::fromDate('2026-04-06 14:00', '2026-04-06 15:30'),  // Meeting C
);
```

### Finding Gaps

"What time slots are free today?"

```php
$gaps = $sequence->gaps();
// 10:30-11:00, 12:00-14:00
```

Shift scheduling, meeting room availability, doctor appointment slots — `gaps()` handles it in one line.

### Finding Intersections

"Which time slots have two or more meetings overlapping?"

```php
$overlaps = $sequence->intersections();
```

### Sorting

```php
$sorted = $sequence->sorted(fn (Period $a, Period $b) => $a->startDate <=> $b->startDate);
```

## Practical Use Cases

### Meeting Room Conflict Detection

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

### Available Slot Query

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

### Reports: Monthly Breakdown

```php
$year = Period::fromYear(2026);

foreach ($year->splitForward('1 MONTH') as $month) {
    $orders = getOrdersInPeriod($month);
    echo $month->startDate->format('Y-m') . ': ' . count($orders) . " orders\n";
}
```

## Formatting

```php
$period = Period::fromDate('2026-04-06 09:00', '2026-04-06 10:30');

// ISO 8601
echo $period;
// 2026-04-06T09:00:00+08:00/2026-04-06T10:30:00+08:00

// ISO 80000 (mathematical notation)
echo $period->toIso80000('Y-m-d H:i');
// [2026-04-06 09:00, 2026-04-06 10:30)

// JSON
echo json_encode($period);
```

## Summary

Handling time intervals with raw `DateTime` is easy to write, hard to debug, and even harder to maintain. League Period wraps it all into a clean API:

- Create intervals without calculating day counts
- Overlap checks without hand-written conditions
- `Sequence`'s `gaps()` / `intersections()` solve common scheduling, booking, and reporting needs
- Immutable design — safe to pass around without worrying about mutation

Good fit for anything involving "a span of time": booking systems, shift scheduling, reports, event dates, contract validity periods.
