---
title: 'pytest-mock: Cleaner Mocking With the mocker Fixture'
date: '2026-04-03T09:00:00+08:00'
slug: pytest-mock
image: cover.jpg
description: "pytest-mock provides a mocker fixture that integrates unittest.mock.patch into pytest's lifecycle — no manual start/stop, no with blocks, no decorator ordering issues. spy preserves real behavior while tracking calls. stub tests callbacks."
categories:
  - Python
  - Testing
tags:
  - pytest
  - mock
  - testing
  - python
  - spy
  - stub
  - unittest
---

Using `unittest.mock.patch` directly has a few rough edges.

With the decorator form, argument order is counterintuitive:

```python
@patch('module.ClassB')
@patch('module.ClassA')
def test_something(mock_a, mock_b):  # reversed from decorator order
    ...
```

With the context manager form, multiple patches mean nesting:

```python
def test_something():
    with patch('module.A') as mock_a:
        with patch('module.B') as mock_b:
            ...
```

[pytest-mock](https://pytest-mock.readthedocs.io/)'s `mocker` fixture cleans this up: patches are automatically reverted when the test ends, no context manager or decorator needed, mock objects come back directly.

## Install

```bash
pip install pytest-mock
```

## Basic Patching

```python
def test_send_email(mocker):
    mock_smtp = mocker.patch('myapp.email.smtplib.SMTP')

    send_welcome_email('user@example.com')

    mock_smtp.return_value.send_message.assert_called_once()
```

`mocker.patch()` works the same as `unittest.mock.patch`, but without `with` or `@`. Automatically unpatched when the test ends.

## Patching an Object's Method

```python
def test_save(mocker):
    mock_save = mocker.patch.object(UserRepository, 'save')

    service.create_user('Alice')

    mock_save.assert_called_once()
```

`mocker.patch.object(TargetClass, 'method_name')` is less error-prone than spelling out the full dotted path.

## Return Values and side_effect

```python
def test_get_user(mocker):
    mocker.patch('myapp.db.find_user', return_value={'id': 1, 'name': 'Alice'})

    result = get_user(1)
    assert result['name'] == 'Alice'
```

```python
def test_retry_on_error(mocker):
    mocker.patch(
        'myapp.api.fetch',
        side_effect=[ConnectionError(), ConnectionError(), {'data': 'ok'}]
    )

    result = fetch_with_retry()
    assert result == {'data': 'ok'}
```

`side_effect` with a list returns each item in sequence — useful for simulating failures followed by success.

## Patch Location Matters

Patch where it's **used**, not where it's **defined**.

```python
# myapp/notifications.py
from myapp.email import send_email  # imported here

def notify_user(user):
    send_email(user['email'])  # used under this name
```

```python
# Wrong: patching where it's defined
mocker.patch('myapp.email.send_email')

# Correct: patching where it's used
mocker.patch('myapp.notifications.send_email')
```

This is one of the most common mock mistakes. See [Python mock: where to patch](/en/p/python-mock-imported-function/) for a detailed explanation.

## spy: Track Calls Without Replacing the Real Behavior

`mocker.patch` replaces the target entirely. `mocker.spy` preserves the original logic while tracking calls, return values, and exceptions.

```python
def calculate_tax(amount):
    return amount * 0.1

def test_tax_called(mocker):
    spy = mocker.spy(myapp.tax, 'calculate_tax')

    result = process_order(amount=1000)

    spy.assert_called_once_with(1000)
    assert spy.spy_return == 100.0  # original function actually ran
    assert result == 1100.0         # business logic is correct too
```

Use spy when you want to verify a function was called without faking its behavior. With `mocker.patch`, you'd have to set `return_value` yourself to simulate the real output — spy skips that.

### spy Attributes

```python
spy.assert_called_once()
spy.assert_called_with(arg1, arg2)
spy.call_count                 # number of calls
spy.spy_return                 # return value from last call
spy.spy_return_list            # all return values (v3.13+)
spy.spy_exception              # last exception raised
```

### Async Functions

```python
async def test_async(mocker):
    spy = mocker.spy(myapp, 'async_fetch')
    await fetch_data()
    spy.assert_called_once()
```

## stub: A Lightweight Fake Callback

A stub accepts any arguments and records calls — useful when testing that a callback was invoked:

```python
def test_callback(mocker):
    callback = mocker.stub(name='on_success')

    do_something(on_success=callback)

    callback.assert_called_once_with({'status': 'ok'})
```

## resetall and stopall

```python
def test_something(mocker):
    mock_a = mocker.patch('myapp.A')
    mock_b = mocker.patch('myapp.B')

    # reset call history on all mocks (patches stay active)
    mocker.resetall()

    # manually stop all patches (usually not needed — auto-cleaned at test end)
    mocker.stopall()
```

`resetall()` is useful when you need to assert on two separate phases of a test independently.

## Different Scopes

The default `mocker` is function-scoped. For class or module scope:

```python
@pytest.fixture(scope="module")
def patched_env(module_mocker):
    module_mocker.patch.dict('os.environ', {'API_KEY': 'test-key'})

def test_a(patched_env): ...
def test_b(patched_env): ...  # same module, same patch
```

## Compared to unittest.mock Directly

```python
# unittest.mock
from unittest.mock import patch

def test_something():
    with patch('myapp.service.fetch') as mock_fetch:
        mock_fetch.return_value = {'data': 'ok'}
        result = do_something()
        mock_fetch.assert_called_once()

# pytest-mock
def test_something(mocker):
    mock_fetch = mocker.patch('myapp.service.fetch', return_value={'data': 'ok'})
    result = do_something()
    mock_fetch.assert_called_once()
```

One less indentation level, `return_value` set inline, mock object returned directly.

The difference is bigger with multiple patches:

```python
# unittest.mock
def test_something():
    with patch('myapp.A') as mock_a:
        with patch('myapp.B') as mock_b:
            with patch('myapp.C') as mock_c:
                ...

# pytest-mock
def test_something(mocker):
    mock_a = mocker.patch('myapp.A')
    mock_b = mocker.patch('myapp.B')
    mock_c = mocker.patch('myapp.C')
    ...
```

## Summary

pytest-mock doesn't add new capabilities — it makes `unittest.mock` fit naturally into pytest:

- `mocker.patch` → no `with` / decorator, auto-cleanup
- `mocker.spy` → real behavior preserved + call tracking
- `mocker.stub` → lightest-weight fake callback

Combined with [pytest](/en/p/pytest-getting-started/) fixtures and [polyfactory](/en/p/polyfactory-test-data/) for test data, test setup overhead gets very low.
