---
title: 'pytest-mock：用 mocker fixture 讓 mock 更乾淨'
date: '2026-04-03T09:00:00+08:00'
slug: pytest-mock
image: cover.jpg
description: 'pytest-mock 提供 mocker fixture，把 unittest.mock.patch 整合進 pytest 的生命週期，不需要手動 start/stop，也不用 with 或 decorator。spy 保留原始行為同時追蹤呼叫，stub 測回調。'
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

用 `unittest.mock.patch` 直接寫 mock，有幾個讓人不舒服的地方。

用 decorator 的話，參數順序容易搞混：

```python
@patch('module.ClassB')
@patch('module.ClassA')
def test_something(mock_a, mock_b):  # 注意：順序是反的
    ...
```

用 `with` 的話，多個 patch 就得嵌套：

```python
def test_something():
    with patch('module.A') as mock_a:
        with patch('module.B') as mock_b:
            ...
```

[pytest-mock](https://pytest-mock.readthedocs.io/) 的 `mocker` fixture 把這些都簡化掉：patch 測試結束自動還原，不需要 context manager 或 decorator，mock 物件直接拿來用。

## 安裝

```bash
pip install pytest-mock
```

## 基本 patch

```python
def test_send_email(mocker):
    mock_smtp = mocker.patch('myapp.email.smtplib.SMTP')

    send_welcome_email('user@example.com')

    mock_smtp.return_value.send_message.assert_called_once()
```

`mocker.patch()` 的用法跟 `unittest.mock.patch` 一樣，但不需要 `with` 或 `@`。測試結束後自動 unpatch，不會影響其他測試。

## patch 物件的方法

```python
def test_save(mocker):
    mock_save = mocker.patch.object(UserRepository, 'save')

    service.create_user('Alice')

    mock_save.assert_called_once()
```

`mocker.patch.object(目標類別, '方法名')` 比 `mocker.patch('full.path.to.ClassName.method')` 更不容易寫錯路徑。

## 設定回傳值和 side_effect

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

`side_effect` 傳 list 的話，每次呼叫依序回傳，模擬前幾次失敗、最後成功的情境。

## patch 位置很重要

patch 要 patch **用到它的地方**，不是定義它的地方。

```python
# myapp/notifications.py
from myapp.email import send_email  # 在這裡 import 了

def notify_user(user):
    send_email(user['email'])  # 用這裡的名稱
```

```python
# 錯誤：patch 定義的地方
mocker.patch('myapp.email.send_email')

# 正確：patch 用到它的地方
mocker.patch('myapp.notifications.send_email')
```

這個問題很常見。詳細說明可以參考 [Python mock：patch 要在哪裡 patch]({{< ref "/post/python-mock-imported-function" >}})。

## spy：保留原始行為，同時追蹤呼叫

`mocker.patch` 完全替換目標。`mocker.spy` 保留原始邏輯，但追蹤呼叫次數和參數。

```python
def calculate_tax(amount):
    return amount * 0.1

def test_tax_called(mocker):
    spy = mocker.spy(myapp.tax, 'calculate_tax')

    result = process_order(amount=1000)

    spy.assert_called_once_with(1000)
    assert spy.spy_return == 100.0  # 原始函式確實執行了
    assert result == 1100.0         # 業務邏輯也正確
```

spy 適合「我想確認這個函式有被呼叫，但不需要假掉它的行為」的情境。

如果你只用 `mocker.patch`，你得自己設 `return_value` 模擬真實回傳值，spy 省掉這一步。

### spy 的屬性

```python
spy.assert_called_once()
spy.assert_called_with(arg1, arg2)
spy.call_count                 # 呼叫次數
spy.spy_return                 # 最後一次回傳值
spy.spy_return_list            # 所有回傳值（v3.13+）
spy.spy_exception              # 最後一次拋出的例外
```

### spy async 函式

```python
async def test_async(mocker):
    spy = mocker.spy(myapp, 'async_fetch')
    await fetch_data()
    spy.assert_called_once()
```

## stub：測回調用的假函式

stub 是最簡單的假物件，接受任何參數、記錄呼叫，用來測「某個回調有沒有被呼叫」：

```python
def test_callback(mocker):
    callback = mocker.stub(name='on_success')

    do_something(on_success=callback)

    callback.assert_called_once_with({'status': 'ok'})
```

## resetall 和 stopall

```python
def test_something(mocker):
    mock_a = mocker.patch('myapp.A')
    mock_b = mocker.patch('myapp.B')

    # 重設所有 mock 的呼叫紀錄（但保留 patch）
    mocker.resetall()

    # 手動停止所有 patch（通常不需要，測試結束會自動）
    mocker.stopall()
```

`resetall()` 在同一個測試裡需要「清掉前半段的呼叫紀錄，再檢查後半段」時用。

## 不同 scope 的 mocker

預設 `mocker` 是 function scope，每個測試獨立。如果需要 class 或 module 層級的 mock：

```python
@pytest.fixture(scope="module")
def patched_env(module_mocker):
    module_mocker.patch.dict('os.environ', {'API_KEY': 'test-key'})

def test_a(patched_env): ...
def test_b(patched_env): ...  # 同一個 module 共用
```

## 跟直接用 unittest.mock 比

```python
# unittest.mock 直接用
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

少了一層縮排，return_value 直接在 patch 時設，mock 物件直接拿到，不需要 `as`。

多個 patch 的差距更明顯：

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

## 小結

pytest-mock 不是新功能，而是讓 `unittest.mock` 的使用體驗配合 pytest 更順手：

- `mocker.patch` → 不需要 with / decorator，自動清理
- `mocker.spy` → 保留原始行為 + 追蹤呼叫
- `mocker.stub` → 最輕量的假回調

搭配 [pytest]({{< ref "/post/pytest-getting-started" >}}) 的 fixture 和 [polyfactory]({{< ref "/post/polyfactory-test-data" >}}) 的假資料，測試的準備工作基本上可以壓到最低。

## 參考資源

- [pytest-mock 官方文件](https://pytest-mock.readthedocs.io/)
- [pytest-mock GitHub 倉庫](https://github.com/pytest-dev/pytest-mock)
- [Python unittest.mock 官方文件](https://docs.python.org/3/library/unittest.mock.html)
- [pytest fixture 說明](https://docs.pytest.org/en/stable/how-to/fixtures.html)
