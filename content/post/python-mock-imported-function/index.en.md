---
title: 'Python Mock Pitfall: Patch Where It Is Used, Not Where It Is Defined'
date: '2026-03-19T09:00:00+08:00'
slug: python-mock-imported-function
description: "The most common Python mock mistake: patching utils.sum when the test still runs the real function. When you do `from utils import sum`, the importing module gets its own binding. Patch the importing module's namespace, not the original definition."
categories:
  - Python
  - Testing
tags:
  - python
  - testing
  - mock
  - unittest
  - patch
  - pytest
---

`from utils import sum`, then `patch('utils.sum')` — and the mock never takes effect.
Switch to `patch('helloworld.sum')` and it works.
This is the most common Python mock mistake. Once you understand why, you won't hit it again.

## Reproducing the Problem

`utils.py`:

```python
def sum(a, b):
    return a + b
```

`helloworld.py`:

```python
from utils import sum

def main():
    return sum(1, 2)
```

Writing a test to mock `sum`:

```python
from unittest.mock import patch

def test_main():
    with patch('utils.sum') as mocked:
        mocked.return_value = 5
        assert main() == 5  # Fails! AssertionError: 3 != 5
```

`main()` returns `3`, not `5`. The mock didn't take effect.

## Why

`from utils import sum` does one thing: it copies a reference to the `utils.sum` function object into `helloworld`'s namespace.

After that import, when `helloworld` calls `sum`, it's using **`helloworld.sum`** — not `utils.sum`.

`patch('utils.sum')` does replace the `sum` in the `utils` module. But `helloworld.sum` still points at the original function object. It was never touched.

Visualized:

```
After patch('utils.sum'):

utils.sum ──────→ MockObject    ← patch replaced this
helloworld.sum ──→ <original>   ← this is untouched; main() uses this
```

## The Fix

Patch the **module that uses the function** — the module under test:

```python
def test_main():
    with patch('helloworld.sum') as mocked:  # patch here instead
        mocked.return_value = 5
        assert main() == 5  # passes
```

`patch('helloworld.sum')` replaces the `sum` in `helloworld`'s namespace. That's the one `main()` calls, so the mock works.

## The Rule: Patch Where It's Used

This rule is easy to remember:

> Patch **where the name is used**, not **where it's defined**.

| Import style | Patch target |
|---|---|
| `from utils import sum` | `patch('helloworld.sum')` |
| `import utils` | `patch('utils.sum')` |

With `import utils`, calling `utils.sum(...)` looks up `sum` through the `utils` module every time — no separate binding is created in `helloworld`. So `patch('utils.sum')` works there.

## Full Example

```python
# utils.py
def sum(a, b):
    return a + b
```

```python
# helloworld.py
from utils import sum

def main():
    return sum(1, 2)
```

```python
# test_helloworld.py
from unittest.mock import patch
from helloworld import main

def test_main_wrong_patch():
    # Wrong: patches utils.sum, but helloworld.sum is unaffected
    with patch('utils.sum') as mocked:
        mocked.return_value = 5
        result = main()
        assert result == 5  # AssertionError: 3 != 5

def test_main_correct_patch():
    # Correct: patches the binding in the module that uses it
    with patch('helloworld.sum') as mocked:
        mocked.return_value = 5
        result = main()
        assert result == 5  # passes
```

## When Both Functions Are in the Same Module

```python
# app.py
def sum(a, b):
    return a + b

def main():
    return sum(1, 2)
```

```python
# test_app.py
with patch('app.sum') as mocked:
    mocked.return_value = 5
    assert main() == 5  # passes
```

Same principle: `main()` looks up `sum` in the `app` namespace, so that's where you patch.

## Summary

Python's import mechanism creates a separate binding in the importing module. After `from X import Y`, the module has its own `Y` — a separate reference from `X.Y`.

The patch target is always **where the call happens**, not where the function is defined. Keep that rule in mind and mock-not-working problems essentially disappear.
