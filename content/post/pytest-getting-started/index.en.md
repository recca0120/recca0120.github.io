---
title: 'pytest: assert Is Enough, Forget self.assertEqual'
date: '2026-03-30T09:00:00+08:00'
slug: pytest-getting-started
description: "The biggest difference between pytest and unittest isn't features — it's how comfortable it is to write. Plain assert works, failure messages expand automatically, and fixtures are far more flexible than setUp/tearDown."
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

After switching from unittest to pytest, the thing I noticed most wasn't some killer feature — it was not having to remember all the `assertXxx` methods.

Just write `assert result == expected`. pytest knows how to expand the failure message on its own.

## Why pytest Instead of unittest

unittest ships with the standard library, no install needed, but it has some rough edges:

- Tests must inherit from `TestCase` — you can't just write plain functions
- You need `self.assertEqual`, `self.assertIn`, `self.assertRaises`… hard to keep track of
- `setUp` / `tearDown` scope is fixed at the class level, not flexible

Three things in pytest that made me not go back:

1. **Plain assert** — failures show the actual values automatically
2. **Fixtures injected on demand** — scope can be function / class / module / session
3. **parametrize** — test multiple inputs with one decorator

## Install

```bash
pip install pytest
```

## The Simplest Test

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

On failure:

```
FAILED test_calc.py::test_add
AssertionError: assert 4 == 3
 +  where 4 = add(2, 2)
```

No guessing which value is which — pytest expands it.

## Fixtures: Better Than setUp

unittest's `setUp` runs before every test with fixed class scope.

pytest fixtures let you control scope and share across modules:

```python
import pytest

@pytest.fixture
def db():
    conn = create_db_connection()
    yield conn
    conn.close()  # teardown goes after yield

def test_query(db):
    result = db.query("SELECT 1")
    assert result == 1
```

Setup before `yield`, teardown after. Much cleaner.

### Scope

```python
@pytest.fixture(scope="module")   # one instance per module
def expensive_resource():
    return load_something_slow()
```

| scope | lifetime |
|---|---|
| `function` | default — rebuilt for every test |
| `class` | shared within a class |
| `module` | shared within a file |
| `session` | shared for the entire test run |

I typically set database connections to `session` scope, with each test function running inside its own transaction that rolls back. The full test suite runs without being painfully slow.

### conftest.py

Fixtures in `conftest.py` are available to all test files in the same directory — no imports needed:

```
tests/
├── conftest.py       # shared fixtures here
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

Both `test_users.py` and `test_orders.py` can use `admin_user` without importing anything.

## parametrize: Multiple Inputs at Once

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

Each set of inputs runs as a separate test. On failure, it tells you exactly which input set broke:

```
FAILED test_calc.py::test_add[0-0-1]
```

I use this for boundary conditions — normal values, zero, negatives, extremes all in one go.

## Testing Exceptions

```python
import pytest

def test_divide_by_zero():
    with pytest.raises(ZeroDivisionError):
        1 / 0
```

To also check the exception message:

```python
def test_value_error():
    with pytest.raises(ValueError, match="invalid input"):
        parse_value("abc")
```

## Running Only Some Tests

```bash
# specific file
pytest test_users.py

# specific function
pytest test_users.py::test_login

# by keyword
pytest -k "login or register"

# only last failed
pytest --lf
```

`--lf` (last failed) is what I reach for most. Fix a bug, immediately re-run just the tests that were failing — no need to wait through the whole suite.

## Useful Options

```bash
pytest -v          # show each test name
pytest -s          # don't capture stdout (print shows up)
pytest -x          # stop on first failure
pytest --tb=short  # shorter tracebacks
```

During development I almost always add `-x` — one failure at a time, output doesn't get buried.

## Summary

The gap between pytest and unittest isn't about features — it's about how comfortable the writing experience is. Plain `assert`, on-demand fixture composition, `parametrize` for multiple inputs. Once those habits are in place, testing stops feeling like something that requires opening documentation every time.

If your tests need a lot of fake data, [polyfactory](/en/p/polyfactory-test-data/) generates it from type hints automatically — no hand-crafting fixture data.

## References

- [pytest official documentation](https://docs.pytest.org/)
- [pytest fixtures — how-to guide](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [pytest parametrize documentation](https://docs.pytest.org/en/stable/how-to/parametrize.html)
- [pytest GitHub repository](https://github.com/pytest-dev/pytest)
