---
title: 'polyfactory: Stop Hand-Writing Test Fixtures, Let Type Hints Do It'
date: '2026-03-31T09:00:00+08:00'
slug: polyfactory-test-data
description: 'polyfactory generates test data automatically from Python type hints. Supports dataclasses, Pydantic v2, TypedDict, and msgspec. Pair it with pytest fixtures to eliminate the boilerplate of hand-crafting fake objects for every test.'
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

Preparing fake data for tests is its own kind of overhead.

To test a user system, you need to build a `User` object — fill in id, email, name, created_at. If you're testing orders, you need an `Order`, which contains a list of `OrderItem`. Hand-crafting all of that often takes longer than writing the actual test logic.

[polyfactory](https://github.com/litestar-org/polyfactory) solves this: give it a class with type hints, and it generates conforming fake data automatically.

## Install

```bash
pip install polyfactory
```

With Pydantic:

```bash
pip install polyfactory pydantic
```

## Basic Usage: dataclass

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

Every `build()` call produces different values — id is a random int, email is a random string, is_active is random True/False.

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

Pydantic validators still run — polyfactory won't generate data that fails validation.

## Overriding Specific Fields

Most of the time you only care about a few fields — just pass them in:

```python
# only set status, everything else is auto-filled
order = OrderFactory.build(status="paid")

# or set defaults in the factory class
class PaidOrderFactory(OrderFactory):
    status = "paid"
    amount = 100.0
```

This is the pattern I use most: base factory handles the bulk of the data, override the fields that matter for the specific test. No need to hardcode the whole object every time.

## Batch Generation

```python
users = UserFactory.batch(10)
# gives you 10 different User objects
```

Useful when testing a list or pagination logic.

## Combining With pytest Fixtures

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

Fixtures return factory-generated objects. The test doesn't need to know what fields `User` has — only the fields actually relevant to that test need to be specified.

```python
def test_deactivate_user(active_user):
    deactivate(active_user)
    assert not active_user.is_active

def test_list_users(users):
    result = get_user_list(users)
    assert len(result) == 5
```

## TypedDict and attrs

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

## Nested Objects

polyfactory handles nested types recursively:

```python
@dataclass
class Address:
    city: str
    country: str

@dataclass
class User:
    name: str
    address: Address  # nested, auto-generated

class UserFactory(DataclassFactory):
    __model__ = User

user = UserFactory.build()
# user.address is also auto-generated
```

No need to build `AddressFactory` separately and pass it in.

## polyfactory vs Faker

[Faker](https://faker.readthedocs.io/) also generates fake data, but you tell it what you want:

```python
from faker import Faker
fake = Faker()
email = fake.email()
name = fake.name()
```

polyfactory is "give me a class, I'll fill it":

```python
user = UserFactory.build()
```

They're not competing — they serve different needs:

- **Faker**: You care what each field looks like (realistic emails, real city names, etc.)
- **polyfactory**: You just need the types to be correct, the specific values don't matter

Test logic usually doesn't care if an email looks real — it just needs to be a string. For that case, polyfactory is simpler.

## Summary

polyfactory's core idea is one thing: **types are the specification, factories generate data according to types**.

Combined with [pytest](/en/p/pytest-getting-started/) fixtures, getting test data down to one or two lines is straightforward — you can focus on what the test is actually checking.
