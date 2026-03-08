---
title: 'polyfactory：不要手刻測試假資料，讓 type hint 自動生成'
date: '2026-03-31T09:00:00+08:00'
slug: polyfactory-test-data
description: 'polyfactory 根據 Python type hint 自動產生測試資料，支援 dataclass、Pydantic v2、TypedDict、msgspec。搭配 pytest fixture 用，省掉每次寫測試都要 hardcode 一堆假資料的麻煩。'
categories:
  - Python
tags:
  - polyfactory
  - pytest
  - testing
  - python
  - pydantic
  - dataclass
  - factory
  - fixture
---

寫測試的時候，準備假資料這件事本身就是一種負擔。

要測一個使用者系統，你得先建一個 `User` 物件，填上 id、email、name、created_at……如果測的是訂單，還要一個 `Order`，裡面還有 `OrderItem` 的 list。手刻這些東西花的時間，常常比寫測試邏輯本身還多。

[polyfactory](https://github.com/litestar-org/polyfactory) 解決這個問題：給它一個有 type hint 的 class，它自動生成符合型別的假資料。

## 安裝

```bash
pip install polyfactory
```

如果用 Pydantic：

```bash
pip install polyfactory pydantic
```

## 基本用法：dataclass

```python
from dataclasses import dataclass
from polyfactory.factories import DataclassFactory

@dataclass
class User:
    id: int
    name: str
    email: str
    is_active: bool

class UserFactory(DataclassFactory):
    __model__ = User

user = UserFactory.build()
# User(id=42, name='vDjhqXt', email='KpLmn@example.com', is_active=True)
```

每次 `build()` 都生成不同的值，id 是隨機整數，email 是隨機字串，is_active 隨機 True/False。

## Pydantic v2

```python
from pydantic import BaseModel
from polyfactory.factories.pydantic_factory import ModelFactory

class Order(BaseModel):
    id: int
    amount: float
    status: str
    items: list[str]

class OrderFactory(ModelFactory):
    __model__ = Order

order = OrderFactory.build()
# Order(id=7, amount=3.14, status='aBcD', items=['x', 'y'])
```

Pydantic 的 validator 也會跑，`polyfactory` 不會生出不合規格的資料。

## 覆寫特定欄位

大部分情況你只在乎某幾個欄位，其他的不重要——這時候直接傳進去：

```python
# 只指定 status，其他欄位自動填
order = OrderFactory.build(status="paid")

# 或在 Factory class 裡設定預設值
class PaidOrderFactory(OrderFactory):
    status = "paid"
    amount = 100.0
```

這是我最常用的模式：用 base factory 生成大部分的資料，針對測試情境覆寫關鍵欄位，不用每次都 hardcode 整個物件。

## 批次生成

```python
users = UserFactory.batch(10)
# 一次給你 10 個不同的 User
```

測試需要一個 list 或要測分頁邏輯時特別好用。

## 搭配 pytest fixture

```python
# conftest.py
import pytest
from polyfactory.factories import DataclassFactory

@pytest.fixture
def user():
    return UserFactory.build()

@pytest.fixture
def active_user():
    return UserFactory.build(is_active=True)

@pytest.fixture
def users():
    return UserFactory.batch(5)
```

fixture 直接回傳 factory 生成的物件，測試裡不需要知道 User 有哪些欄位——只有你真正在乎的欄位需要指定。

```python
def test_deactivate_user(active_user):
    deactivate(active_user)
    assert not active_user.is_active

def test_list_users(users):
    result = get_user_list(users)
    assert len(result) == 5
```

## TypedDict 和 attrs

```python
from typing import TypedDict
from polyfactory.factories import TypedDictFactory

class Config(TypedDict):
    host: str
    port: int
    debug: bool

class ConfigFactory(TypedDictFactory):
    __model__ = Config

config = ConfigFactory.build()
# {'host': 'abc', 'port': 8080, 'debug': False}
```

## 巢狀物件

polyfactory 自動遞迴處理巢狀型別：

```python
@dataclass
class Address:
    city: str
    country: str

@dataclass
class User:
    name: str
    address: Address  # 巢狀，自動生成

class UserFactory(DataclassFactory):
    __model__ = User

user = UserFactory.build()
# user.address 也是自動生成的 Address 物件
```

不用分開建 `AddressFactory` 再傳進去，省了一層。

## 跟 Faker 的差別

[Faker](https://faker.readthedocs.io/) 也可以生假資料，但它的使用方式是「告訴我要什麼」：

```python
from faker import Faker
fake = Faker()
email = fake.email()
name = fake.name()
```

polyfactory 是「給我一個 class，我幫你填」：

```python
user = UserFactory.build()
```

兩者不衝突，但用途不同：

- **Faker**：你要控制每個欄位長什麼樣子（逼真的 email、真實城市名等）
- **polyfactory**：你只在乎型別正確，不在乎具體值

測試邏輯通常不在乎 email 是不是真實格式，只要是個字串就好——這種情況 polyfactory 的寫法更簡單。

## 小結

polyfactory 的核心概念就一個：**型別就是規格，factory 照著型別生資料**。

配合 [pytest](/p/pytest-getting-started/) 的 fixture 用，測試準備資料這件事基本上可以降到一兩行，把注意力放在測試邏輯本身。
