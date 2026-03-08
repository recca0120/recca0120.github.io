---
title: 'SQL NULL 的兩個陷阱：JOIN 撈不到資料、UNIQUE 限制失效'
date: '2026-03-24T09:00:00+08:00'
slug: sql-null-join-unique
description: '各資料庫對 NULL 的解釋不同，衍生兩個常見問題：JOIN 欄位都是 NULL 時資料撈不到，以及 UNIQUE 欄位允許多筆 NULL 導致限制失效。MySQL、PostgreSQL、SQLite、SQL Server 行為各不同。'
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

JOIN 兩張表，欄位值都是 `NULL`，結果撈不到任何資料。
在有 UNIQUE 的欄位插入兩筆 `NULL`，完全沒報錯。
這兩個問題的根源都是同一個：SQL 標準規定 `NULL` 不等於任何東西，包括另一個 `NULL`。

## NULL 的本質

SQL 裡的 `NULL` 代表「未知」，不是零也不是空字串。

```sql
SELECT NULL = NULL;   -- 結果是 NULL，不是 TRUE
SELECT NULL IS NULL;  -- 結果是 TRUE
```

`NULL = NULL` 回傳 `NULL`，不是 `TRUE`。這個規則直接影響 JOIN 和 UNIQUE 的行為。

---

## 問題一：JOIN 欄位是 NULL，資料撈不到

### 情境

兩張表，`orders` 的 `customer_id` 有些是 `NULL`，想用 JOIN 找出對應的 customer：

```sql
-- customers 表
| id   | name  |
|------|-------|
| NULL | Alice |
| 1    | Bob   |

-- orders 表
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

結果：

```
| id | name | amount |
|----|------|--------|
| 2  | Bob  | 200    |
```

`order.id = 1` 消失了，即使 `orders.customer_id = NULL` 跟 `customers.id = NULL` 看起來「應該」要對上。

### 原因

`INNER JOIN` 的條件是 `o.customer_id = c.id`。當兩個值都是 `NULL` 時，`NULL = NULL` 的結果是 `NULL`，不是 `TRUE`，所以這個 row 不符合 JOIN 條件，被過濾掉。

### 解法

**方案一：用 `IS NOT DISTINCT FROM`（SQL 標準，把兩個 NULL 當作相等）**

```sql
-- PostgreSQL、SQL Server 2022+ 支援
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON o.customer_id IS NOT DISTINCT FROM c.id;
```

`IS NOT DISTINCT FROM` 把 `NULL IS NOT DISTINCT FROM NULL` 視為 `TRUE`。

**方案二：用 `COALESCE` 替換 NULL**

```sql
-- 替換成一個確定不會出現在資料裡的佔位值
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON COALESCE(o.customer_id, -1) = COALESCE(c.id, -1);
```

把 `NULL` 換成 `-1`，讓 `= ` 比較可以成立。佔位值要選一個不可能是真實 ID 的值。

**方案三：用 `LEFT JOIN` + 分開處理 NULL**

```sql
SELECT o.id, c.name, o.amount
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE o.customer_id IS NOT NULL   -- 有值的走正常 JOIN
   OR (o.customer_id IS NULL AND c.id IS NULL);  -- NULL 對 NULL 的額外處理
```

**各資料庫支援狀況**

| 語法 | MySQL | PostgreSQL | SQLite | SQL Server |
|---|---|---|---|---|
| `IS NOT DISTINCT FROM` | ✓（8.0.17+） | ✓ | ✓ | ✓（2022+） |
| `<=>` NULL-safe 等號 | ✓ | ✗ | ✗ | ✗ |
| `COALESCE` | ✓ | ✓ | ✓ | ✓ |

MySQL 有專屬的 NULL-safe 等號運算子 `<=>`：

```sql
-- MySQL 專屬
SELECT o.id, c.name, o.amount
FROM orders o
JOIN customers c ON o.customer_id <=> c.id;
```

---

## 問題二：UNIQUE 欄位允許多筆 NULL

### 情境

設計了一個 `email` 欄位，允許 nullable（使用者可以不填 email），加了 UNIQUE 確保填了的話不能重複：

```sql
CREATE TABLE users (
  id   INT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(255) UNIQUE  -- 希望 email 唯一，但可以是 NULL
);
```

插入兩筆 `email = NULL` 的資料：

```sql
INSERT INTO users (id, name, email) VALUES (1, 'Alice', NULL);
INSERT INTO users (id, name, email) VALUES (2, 'Bob', NULL);
```

**SQLite、PostgreSQL、SQL Server**：兩筆都插入成功，不報錯。
**MySQL（部分版本）**：行為不一致，視引擎而定。

### 原因

UNIQUE constraint 的底層是比較值是否相等。因為 `NULL != NULL`，每個 `NULL` 被視為「不同的未知值」，所以多筆 `NULL` 都能通過 UNIQUE 檢查。

這是 SQL 標準的規定行為，SQLite、PostgreSQL、SQL Server 都遵循。MySQL 的 InnoDB 也允許多筆 NULL（但 MyISAM 曾經只允許一筆）。

### 各資料庫行為

```sql
-- SQLite：允許多筆 NULL，符合 SQL 標準
-- PostgreSQL：允許多筆 NULL，符合 SQL 標準
-- SQL Server：允許多筆 NULL，符合 SQL 標準
-- MySQL (InnoDB)：允許多筆 NULL
-- Oracle：允許多筆 NULL
```

幾乎所有主流資料庫都允許 UNIQUE 欄位有多筆 `NULL`。

### 解法

**方案一：改用 Partial Index（PostgreSQL、SQLite）**

只對非 NULL 的值建 UNIQUE index：

```sql
-- PostgreSQL
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;

-- SQLite（3.8.9+）
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;
```

這樣 `NULL` 不進 index，不受 UNIQUE 限制，但有值的 email 之間還是唯一。

**方案二：MySQL 的 Filtered Index**

```sql
-- MySQL 8.0.13+
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;
```

**方案三：NOT NULL + 空字串約定（不推薦）**

```sql
-- 不允許 NULL，用空字串代表「未填」，然後用 trigger 或應用層處理
-- 缺點：語意不清，空字串和「未填」很容易混淆
ALTER TABLE users MODIFY email VARCHAR(255) NOT NULL DEFAULT '';
```

**方案四：SQL Server 的 Filtered Index**

```sql
-- SQL Server
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;
```

---

## 兩個問題的共同根源

這兩個問題來自同一個設計：`NULL` 代表「未知」，不是「空」。

| 操作 | `NULL` 的行為 | 結果 |
|---|---|---|
| `NULL = NULL` | 未知是否相等 | `NULL`（不是 TRUE） |
| `NULL IS NULL` | 確認是 NULL | `TRUE` |
| `NULL IS NOT DISTINCT FROM NULL` | NULL-safe 比較 | `TRUE` |
| JOIN 時 `NULL = NULL` | 不符合 JOIN 條件 | row 被過濾 |
| UNIQUE 時多筆 `NULL` | 每個 NULL 是不同的未知 | 全部通過 |

## 小結

遇到 JOIN 撈不到資料，先檢查 ON 條件的欄位有沒有 NULL。用 `IS NOT DISTINCT FROM` 或 MySQL 的 `<=>` 做 NULL-safe 比較。

UNIQUE + nullable 欄位，要用 Partial Index 限制「只有非 NULL 的值才受 UNIQUE 約束」，光靠 `UNIQUE` 不夠。

設計 schema 時明確決定欄位要不要允許 NULL，不要「先 nullable 再說」，因為 NULL 在 constraint 和 JOIN 裡的行為跟一般人預期的不同。
