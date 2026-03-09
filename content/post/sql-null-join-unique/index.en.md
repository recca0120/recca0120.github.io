---
title: 'Two SQL NULL Traps: Missing JOIN Rows and UNIQUE Constraints That Do Nothing'
date: '2026-03-24T09:00:00+08:00'
slug: sql-null-join-unique
image: featured.jpg
description: 'NULL behavior varies across databases and causes two common problems: JOIN on NULL columns returns no rows, and UNIQUE constraints allow multiple NULLs. Covers MySQL, PostgreSQL, SQLite, SQL Server with solutions for each.'
categories:
  - Database
tags:
  - sql
  - null
  - mysql
  - postgresql
  - sqlite
  - database
---

JOIN two tables on a nullable column and the rows disappear.
Insert two NULLs into a UNIQUE column and neither insert fails.
Both problems share the same root: SQL defines `NULL` as unknown, and unknown is never equal to anything — including another unknown.

## What NULL Actually Means

In SQL, `NULL` means "unknown value" — not zero, not empty string, not false.

```sql
SELECT NULL = NULL;   -- Result: NULL, not TRUE
SELECT NULL IS NULL;  -- Result: TRUE
```

`NULL = NULL` returns `NULL`, not `TRUE`. This single rule is why JOINs and UNIQUE constraints behave unexpectedly with NULL.

---

## Trap 1: JOIN on NULL Columns Returns No Rows

### The Scenario

Two tables where `orders.customer_id` can be NULL. You want to JOIN them to find the customer for each order:

```sql
-- customers table
| id   | name  |
|------|-------|
| NULL | Alice |
| 1    | Bob   |

-- orders table
| id | customer_id | amount |
|----|-------------|--------|
| 1  | NULL        | 100    |
| 2  | 1           | 200    |
```

```sql
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON o.customer_id = c.id;
```

Result:

```
| id | name | amount |
|----|------|--------|
| 2  | Bob  | 200    |
```

`orders.id = 1` vanished, even though both `orders.customer_id` and `customers.id` are NULL.

### Why

The `INNER JOIN` condition is `o.customer_id = c.id`. When both values are NULL, `NULL = NULL` evaluates to `NULL`, not `TRUE`. The row fails the join condition and gets filtered out.

### Solutions

**Option 1: `IS NOT DISTINCT FROM` (SQL standard, treats NULL = NULL as true)**

```sql
-- PostgreSQL, SQL Server 2022+
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON o.customer_id IS NOT DISTINCT FROM c.id;
```

`NULL IS NOT DISTINCT FROM NULL` evaluates to `TRUE`.

**Option 2: COALESCE to replace NULL**

```sql
-- Replace NULL with a sentinel value that will never appear as a real ID
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON COALESCE(o.customer_id, -1) = COALESCE(c.id, -1);
```

Substitutes NULL with `-1` so the `=` comparison succeeds. Choose a sentinel that can't be a real ID.

**Option 3: LEFT JOIN with explicit NULL handling**

```sql
SELECT o.id, c.name, o.amount
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.customer_id IS NOT NULL
   OR (o.customer_id IS NULL AND c.id IS NULL);
```

**Database support**

| Syntax | MySQL | PostgreSQL | SQLite | SQL Server |
|---|---|---|---|---|
| `IS NOT DISTINCT FROM` | ✓ (8.0.17+) | ✓ | ✓ | ✓ (2022+) |
| `<=>` NULL-safe equality | ✓ | ✗ | ✗ | ✗ |
| `COALESCE` | ✓ | ✓ | ✓ | ✓ |

MySQL has its own NULL-safe equality operator:

```sql
-- MySQL only
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON o.customer_id <=> c.id;
```

---

## Trap 2: UNIQUE Constraint Allows Multiple NULLs

### The Scenario

You design a `users` table with a nullable `email` column. Users don't have to provide an email, but if they do, it should be unique:

```sql
CREATE TABLE users (
  id    INT PRIMARY KEY,
  name  VARCHAR(100),
  email VARCHAR(255) UNIQUE  -- unique if provided, NULL if not
);
```

Insert two rows with `email = NULL`:

```sql
INSERT INTO users (id, name, email) VALUES (1, 'Alice', NULL);
INSERT INTO users (id, name, email) VALUES (2, 'Bob', NULL);
```

**SQLite, PostgreSQL, SQL Server**: both inserts succeed. No error.
**MySQL (InnoDB)**: also succeeds.

The UNIQUE constraint does nothing for NULL values.

### Why

A UNIQUE constraint works by checking whether the new value equals any existing value. Since `NULL != NULL`, every NULL is treated as a distinct unknown — multiple NULLs all pass the uniqueness check.

This is specified behavior, not a bug. SQLite, PostgreSQL, SQL Server, MySQL InnoDB, and Oracle all follow it.

### Solutions

**Option 1: Partial Index (PostgreSQL, SQLite)**

Build a UNIQUE index only over non-NULL values:

```sql
-- PostgreSQL
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;

-- SQLite (3.8.9+)
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;
```

NULL values aren't indexed at all, so they bypass the uniqueness check. Non-NULL emails are still enforced as unique.

**Option 2: MySQL Filtered Index**

```sql
-- MySQL 8.0.13+
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;
```

**Option 3: SQL Server Filtered Index**

```sql
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;
```

**Option 4: NOT NULL + empty string (not recommended)**

```sql
-- Forces every row to have an email; use empty string for "not provided"
-- Problem: semantically ambiguous — empty string vs not provided
ALTER TABLE users MODIFY email VARCHAR(255) NOT NULL DEFAULT '';
```

---

## Both Traps, One Root Cause

Both problems come from the same design principle: `NULL` means unknown, not empty.

| Operation | NULL behavior | Outcome |
|---|---|---|
| `NULL = NULL` | Unknown whether equal | `NULL` (not TRUE) |
| `NULL IS NULL` | Checks for NULL | `TRUE` |
| `NULL IS NOT DISTINCT FROM NULL` | NULL-safe comparison | `TRUE` |
| JOIN `NULL = NULL` | Fails the join condition | Row filtered out |
| UNIQUE with multiple NULLs | Each NULL is a different unknown | All pass |

## Summary

When a JOIN is dropping rows, check whether the ON condition columns can be NULL. Use `IS NOT DISTINCT FROM` for a NULL-safe comparison, or MySQL's `<=>`.

For UNIQUE on a nullable column, a plain `UNIQUE` constraint isn't enough. Use a Partial Index (`WHERE column IS NOT NULL`) to enforce uniqueness only for non-NULL values.

When designing a schema, decide explicitly whether a column should be nullable. Don't make it nullable by default — NULL interacts with constraints and JOINs in ways that aren't obvious until something silently breaks.

## References

- [PostgreSQL: Comparison Functions and NULL](https://www.postgresql.org/docs/current/functions-comparison.html)
- [MySQL: Comparison Operators and NULL-Safe Equality](https://dev.mysql.com/doc/refman/8.0/en/comparison-operators.html)
- [SQLite: Partial Indexes](https://www.sqlite.org/partialindex.html)
- [SQL NULL Semantics (Wikipedia)](https://en.wikipedia.org/wiki/Null_(SQL))
