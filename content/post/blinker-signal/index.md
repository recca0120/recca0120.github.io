---
title: 'blinker：Python 的 signal 系統，讓模組之間不直接呼叫'
date: '2026-04-01T09:00:00+08:00'
slug: blinker-signal
image: cover.jpg
description: 'blinker 是 Python 輕量的 signal/event 系統，Flask 內部用它處理 request_started、request_finished 等事件。拿來做模組解耦、plugin 架構、避免 circular import 都很合適。'
categories:
  - Python
tags:
  - blinker
  - signal
  - python
  - flask
  - event
---

你有一個 `OrderService`，訂單完成之後要寄通知 email、更新庫存、記 audit log。

最直接的寫法是在 `complete_order()` 裡呼叫 `EmailService`、`InventoryService`、`AuditService`。但這樣 `OrderService` 就跟三個其他模組直接耦合，以後加功能還要改這個函式。

[blinker](https://blinker.readthedocs.io/) 的做法是：`OrderService` 發出一個 signal，想做事的模組自己訂閱，`OrderService` 不需要知道誰在聽。

Flask 內部就是這樣用的——`request_started`、`request_finished` 都是 blinker signal。

## 安裝

```bash
pip install blinker
```

## 基本用法

```python
from blinker import signal

# 建立命名 signal
order_completed = signal('order-completed')

# 訂閱者
def send_email(sender, **kwargs):
    order = kwargs.get('order')
    print(f"寄通知給 {order['customer_email']}")

def update_inventory(sender, **kwargs):
    order = kwargs.get('order')
    print(f"扣庫存：{order['items']}")

# 訂閱
order_completed.connect(send_email)
order_completed.connect(update_inventory)

# 發送（OrderService 只需要這一行）
order_completed.send('order-service', order={'id': 123, 'customer_email': 'user@example.com', 'items': ['A', 'B']})
```

`OrderService` 只發 signal，不知道也不在乎有多少訂閱者。加新功能就加一個訂閱者，不動 `OrderService`。

## 命名 signal 全域共享

`signal('order-completed')` 在同一個 Python 進程裡永遠回傳同一個物件：

```python
from blinker import signal

# 這兩行拿到的是同一個物件
s1 = signal('order-completed')
s2 = signal('order-completed')
assert s1 is s2  # True
```

這讓不同模組可以各自 import `signal` 後取同一個 signal，不需要透過共用的 module 傳遞物件。

## 限定特定 sender

預設任何人發送這個 signal 都會觸發訂閱者。如果只想回應特定物件發出的 signal：

```python
class OrderService:
    def complete(self, order):
        order_completed.send(self, order=order)

service_a = OrderService()
service_b = OrderService()

def on_complete(sender, **kwargs):
    print(f"來自 {sender}")

# 只訂閱 service_a 發出的
order_completed.connect(on_complete, sender=service_a)

service_a.complete(order)  # 觸發
service_b.complete(order)  # 不觸發
```

## 裝飾器語法

```python
@order_completed.connect
def log_order(sender, **kwargs):
    print(f"訂單完成 from {sender}")

# 或限定 sender
@order_completed.connect_via(service_a)
def notify_admin(sender, **kwargs):
    ...
```

## 收集回傳值

`send()` 回傳每個訂閱者的回傳值，格式是 `[(receiver, return_value), ...]`：

```python
def check_stock(sender, **kwargs):
    return "ok"

def check_fraud(sender, **kwargs):
    return "flagged"

order_completed.connect(check_stock)
order_completed.connect(check_fraud)

results = order_completed.send('service', order=order)
# [(check_stock, 'ok'), (check_fraud, 'flagged')]

flagged = [rv for _, rv in results if rv == 'flagged']
```

用在需要各模組回報狀態的場景：發一個 signal，收集所有人的檢查結果。

## 弱參考（weak reference）

預設 blinker 用弱參考追蹤訂閱者——如果訂閱者物件被垃圾回收，連接自動移除，不會 memory leak：

```python
def temporary_handler(sender, **kwargs):
    pass

signal.connect(temporary_handler)
# temporary_handler 被 GC 後，連接自動消失
```

如果你要確保訂閱者不被 GC 掉（例如 lambda 或臨時函式），用 `weak=False`：

```python
signal.connect(lambda s, **kw: print(s), weak=False)
```

## 臨時訂閱（測試用）

```python
results = []

with order_completed.connected_to(lambda s, **kw: results.append(kw)):
    complete_order(order)

# 離開 with 後自動取消訂閱
assert len(results) == 1
```

寫測試時不想污染全域 signal 狀態，用 `connected_to` 很方便。

## async 支援

blinker 1.7+ 支援 async 訂閱者：

```python
import asyncio

async def async_handler(sender, **kwargs):
    await send_notification(kwargs['order'])

order_completed.connect(async_handler)

# 發送時需要用 send_async
await order_completed.send_async('service', _sync_wrapper=asyncio.coroutine, order=order)
```

## 用 Namespace 管理 signal 集合

```python
from blinker import Namespace

order_signals = Namespace()
order_completed = order_signals.signal('completed')
order_cancelled = order_signals.signal('cancelled')
```

把同一個模組的 signal 放在同一個 namespace，不容易撞名，也方便 import：

```python
# orders/signals.py
from blinker import Namespace
signals = Namespace()
completed = signals.signal('completed')
cancelled = signals.signal('cancelled')

# 其他模組
from orders.signals import completed
completed.connect(my_handler)
```

## 跟 Flask signal 的關係

Flask 的 request lifecycle signal 就是用 blinker 實作的：

```python
from flask import request_started, request_finished

@request_started.connect_via(app)
def on_request_started(sender, **kwargs):
    print(f"Request started: {request.path}")
```

這也是 blinker 設計的典型應用場景：框架發 signal，使用者的程式訂閱，框架不需要知道使用者做了什麼。

## 小結

blinker 讓模組之間用 signal 溝通，而不是直接呼叫。發送方不知道誰在聽，訂閱方不需要被發送方 import。

適合的場景：
- 一個事件觸發多個動作（訂單完成 → email + 庫存 + log）
- plugin 架構（核心模組不知道 plugin 存在）
- 避免 circular import（A import B，B 又需要呼叫 A 的東西）
- 測試時需要 hook 某個時間點

## 參考資源

- [blinker 官方文件](https://blinker.readthedocs.io/)
- [blinker GitHub 倉庫](https://github.com/pallets-eco/blinker)
- [Flask Signals 官方文件](https://flask.palletsprojects.com/signals/)
- [PyPI — blinker 套件頁面](https://pypi.org/project/blinker/)

