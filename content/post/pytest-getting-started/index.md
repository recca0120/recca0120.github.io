---
title: 'pytest 入門：assert 就夠了，不需要記 self.assertEqual'
date: '2026-03-30T09:00:00+08:00'
slug: pytest-getting-started
image: cover.jpg
description: 'pytest 跟 unittest 最大的差距不是功能多寡，而是寫起來有多舒服。assert 直接用，失敗訊息自動展開，fixture 比 setUp/tearDown 靈活很多。'
categories:
  - Python
  - Testing
tags:
  - pytest
  - testing
  - python
  - fixture
  - unit-testing
  - parametrize
---

從 unittest 切換到 pytest 之後，我最有感的不是哪個殺手級功能，而是不用再記一堆 `assertXxx`。

寫 `assert result == expected` 就好，pytest 自己知道怎麼把失敗訊息展開得一清二楚。

## 為什麼選 pytest 而不是 unittest

unittest 是標準庫，不需要安裝，但它有幾個地方讓人不舒服：

- 測試類別要繼承 `TestCase`，不能直接寫函式
- 斷言要用 `self.assertEqual`、`self.assertIn`、`self.assertRaises`……記不完
- `setUp` / `tearDown` 不夠靈活，scope 固定在 class 層級

pytest 三件事讓我回不去：

1. **assert 直接寫**，失敗時自動展開變數值
2. **fixture 按需注入**，scope 可以是 function / class / module / session
3. **parametrize 一個裝飾器搞定多組輸入**

## 安裝

```bash
pip install pytest
```

## 最簡單的測試

```python
# test_calc.py
def add(a, b):
    return a + b

def test_add():
    assert add(1, 2) == 3
```

```bash
pytest test_calc.py
```

失敗時的輸出長這樣：

```
FAILED test_calc.py::test_add
AssertionError: assert 4 == 3
 +  where 4 = add(2, 2)
```

不用猜哪個值是哪個，pytest 自己展開。

## Fixture：比 setUp 好用

unittest 的 `setUp` 每次測試前都執行，範圍固定是 class。

pytest 的 fixture 可以控制 scope，也可以跨模組共用：

```python
import pytest

@pytest.fixture
def db():
    conn = create_db_connection()
    yield conn
    conn.close()  # teardown 放 yield 後面

def test_query(db):
    result = db.query("SELECT 1")
    assert result == 1
```

`yield` 前是 setup，`yield` 後是 teardown，清楚很多。

### Scope 控制

```python
@pytest.fixture(scope="module")   # 整個模組共用一個
def expensive_resource():
    return load_something_slow()
```

| scope | 生命週期 |
|---|---|
| `function` | 預設，每次測試重建 |
| `class` | 同 class 的測試共用 |
| `module` | 同檔案共用 |
| `session` | 整個測試 session 共用 |

我習慣把資料庫連線設成 `session`，每個 test function 用自己的 transaction 再 rollback，這樣跑全套測試不會慢到受不了。

### conftest.py

fixture 放在 `conftest.py` 就能跨測試檔案用，不需要 import：

```
tests/
├── conftest.py       # 共用 fixture 放這裡
├── test_users.py
└── test_orders.py
```

```python
# conftest.py
import pytest

@pytest.fixture
def admin_user():
    return {"id": 1, "role": "admin"}
```

`test_users.py` 和 `test_orders.py` 都能直接用 `admin_user`，不需要 import。

## parametrize：一次測多組輸入

```python
@pytest.mark.parametrize("a, b, expected", [
    (1, 2, 3),
    (0, 0, 0),
    (-1, 1, 0),
    (100, -50, 50),
])
def test_add(a, b, expected):
    assert add(a, b) == expected
```

每一組輸入會跑成獨立的測試，失敗時直接告訴你哪組輸入出問題：

```
FAILED test_calc.py::test_add[0-0-1]
```

我用這個測邊界條件最方便，把正常值、0、負數、極大值都列進去，一個函式搞定。

## 測例外

```python
import pytest

def test_divide_by_zero():
    with pytest.raises(ZeroDivisionError):
        1 / 0
```

如果要確認例外訊息：

```python
def test_value_error():
    with pytest.raises(ValueError, match="invalid input"):
        parse_value("abc")
```

## 只跑部分測試

```bash
# 指定檔案
pytest test_users.py

# 指定函式
pytest test_users.py::test_login

# 用關鍵字過濾
pytest -k "login or register"

# 只跑上次失敗的
pytest --lf
```

`--lf`（last failed）是我最常用的，改完 bug 馬上只跑剛才失敗的測試，不用等全套。

## 常用選項

```bash
pytest -v          # 顯示每個測試的名稱
pytest -s          # 不擷取 stdout（print 看得到）
pytest -x          # 第一個失敗就停
pytest --tb=short  # 縮短 traceback
```

開發階段我幾乎都加 `-x`，一次看一個失敗，不讓輸出淹沒畫面。

## 小結

pytest 跟 unittest 的差距不在功能，而在寫起來的舒適度。`assert` 直接寫、fixture 按需組合、`parametrize` 測多組輸入，這三個習慣建立起來之後，測試就變成很自然的事，不再是每次都要打開文件查 API 的負擔。

如果你的測試還需要大量假資料，可以搭配 [polyfactory]({{< ref "/post/polyfactory-test-data" >}}) 根據 type hint 自動生成，不用手刻每一筆 fixture data。

## 參考資源

- [pytest 官方文件](https://docs.pytest.org/)
- [pytest fixture 完整說明](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [pytest parametrize 用法](https://docs.pytest.org/en/stable/how-to/parametrize.html)
- [pytest GitHub 倉庫](https://github.com/pytest-dev/pytest)
