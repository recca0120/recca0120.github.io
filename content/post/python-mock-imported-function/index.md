---
title: 'Python Mock 踩坑：patch 要指向被測模組，不是原始模組'
date: '2026-03-19T09:00:00+08:00'
slug: python-mock-imported-function
description: 'Python unittest.mock.patch 的最常見誤區：mock utils.sum 但測試還是跑真的邏輯。原因是 from utils import sum 在被測模組建立了自己的 binding，patch 要指向被測模組的命名空間，不是函式的原始定義位置。'
categories:
  - Backend
tags:
  - python
  - testing
  - mock
  - unittest
  - patch
  - pytest
---

`from utils import sum` 然後 `patch('utils.sum')`，測試死活 mock 不到。
改成 `patch('helloworld.sum')` 就好了。
這是 Python mock 最常見的誤區，搞懂原因之後就不會再踩。

## 問題重現

`utils.py`：

```python
def sum(a, b):
    return a + b
```

`helloworld.py`：

```python
from utils import sum

def main():
    return sum(1 + 2)
```

寫測試，想 mock 掉 `sum`：

```python
from unittest.mock import patch

def test_main():
    with patch('utils.sum') as mocked:
        mocked.return_value = 5
        assert main() == 5  # 失敗！assert 3 != 5
```

`main()` 回傳的是 `3`，不是 `5`。mock 沒有生效。

## 為什麼

`from utils import sum` 這行做了一件事：把 `utils.sum` 這個 function object 複製一份 reference 到 `helloworld` 模組的命名空間裡。

之後 `helloworld` 呼叫的 `sum`，用的是 **`helloworld.sum`** 這個 binding，不是 `utils.sum`。

`patch('utils.sum')` 確實替換了 `utils` 模組裡的 `sum`，但 `helloworld.sum` 還是指著原本的 function object，完全沒被動到。

畫成圖：

```
patch('utils.sum') 之後：

utils.sum ──────→ MockObject   ← patch 改的是這裡
helloworld.sum ──→ <原始 sum>  ← 這個沒動，main() 用這個
```

## 正確寫法

patch 要指向**使用這個函式的模組**，也就是被測模組：

```python
def test_main():
    with patch('helloworld.sum') as mocked:  # 改這裡
        mocked.return_value = 5
        assert main() == 5  # 通過
```

`patch('helloworld.sum')` 替換的是 `helloworld` 命名空間裡的 `sum`，`main()` 呼叫的就是被替換過的版本，mock 生效。

## 原則：patch where it's used

這個規則很好記：

> patch 要寫**使用這個名稱的地方**，不是**定義這個名稱的地方**

| import 方式 | patch 目標 |
|---|---|
| `from utils import sum` | `patch('helloworld.sum')` |
| `import utils` | `patch('utils.sum')` |

第二種情況，`import utils` 之後呼叫 `utils.sum(...)`，`helloworld` 裡沒有建立獨立的 binding，每次呼叫都是透過 `utils` 模組去查，所以 `patch('utils.sum')` 就夠了。

## 完整範例

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

def test_main_with_wrong_patch():
    # 錯誤：patch 打在原始模組，helloworld.sum 沒被替換
    with patch('utils.sum') as mocked:
        mocked.return_value = 5
        result = main()
        assert result == 5  # AssertionError: 3 != 5

def test_main_with_correct_patch():
    # 正確：patch 打在使用的模組
    with patch('helloworld.sum') as mocked:
        mocked.return_value = 5
        result = main()
        assert result == 5  # 通過
```

## 延伸：同一個模組內的函式

如果 `main` 和 `sum` 在同一個模組：

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
    assert main() == 5  # 通過
```

同理，patch 目標是 `app.sum`，也就是 `main` 呼叫時查找的那個命名空間。

## 小結

Python 的 import 機制會在被匯入的模組建立獨立的 binding。`from X import Y` 之後，模組裡就有自己的 `Y`，跟 `X.Y` 是各自獨立的 reference。

patch 的目標永遠是**呼叫發生的地方**，不是函式定義的地方。記住這條規則，mock 不到的問題基本上就不會再出現。
