---
title: "blinker: Python Signals for Decoupling Modules"
date: '2026-04-01T09:00:00+08:00'
slug: blinker-signal
description: "blinker is a lightweight Python signal/event system — it's what Flask uses internally for request_started, request_finished, and other lifecycle events. Good fit for module decoupling, plugin architectures, and avoiding circular imports."
categories:
  - Python
tags:
  - blinker
  - signal
  - python
  - flask
  - event
---

You have an `OrderService`. When an order completes, you need to send a notification email, update inventory, and write an audit log.

The direct approach is calling `EmailService`, `InventoryService`, and `AuditService` inside `complete_order()`. But now `OrderService` is directly coupled to three other modules, and every new side effect means modifying that function.

[blinker](https://blinker.readthedocs.io/)'s approach: `OrderService` fires a signal, and whatever modules care about that event subscribe themselves. `OrderService` doesn't need to know who's listening.

Flask works this way internally — `request_started`, `request_finished` are all blinker signals.

## Install

```bash
pip install blinker
```

## Basic Usage

```python
from blinker import signal

# create a named signal
order_completed = signal('order-completed')

# subscribers
def send_email(sender, **kwargs):
    order = kwargs.get('order')
    print(f"Sending notification to {order['customer_email']}")

def update_inventory(sender, **kwargs):
    order = kwargs.get('order')
    print(f"Deducting stock: {order['items']}")

# subscribe
order_completed.connect(send_email)
order_completed.connect(update_inventory)

# fire (OrderService only needs this line)
order_completed.send('order-service', order={'id': 123, 'customer_email': 'user@example.com', 'items': ['A', 'B']})
```

`OrderService` fires the signal and doesn't care how many subscribers there are. Add new behavior by adding a new subscriber — no changes to `OrderService`.

## Named Signals Are Global

`signal('order-completed')` always returns the same object within the same Python process:

```python
from blinker import signal

s1 = signal('order-completed')
s2 = signal('order-completed')
assert s1 is s2  # True
```

This means different modules can each import `signal` and get the same signal without passing objects around through shared modules.

## Filtering by Sender

By default, any sender firing the signal triggers all subscribers. To respond only when a specific object fires it:

```python
class OrderService:
    def complete(self, order):
        order_completed.send(self, order=order)

service_a = OrderService()
service_b = OrderService()

def on_complete(sender, **kwargs):
    print(f"from {sender}")

# only subscribe to service_a
order_completed.connect(on_complete, sender=service_a)

service_a.complete(order)  # triggers
service_b.complete(order)  # doesn't trigger
```

## Decorator Syntax

```python
@order_completed.connect
def log_order(sender, **kwargs):
    print(f"Order completed from {sender}")

# or restrict to a specific sender
@order_completed.connect_via(service_a)
def notify_admin(sender, **kwargs):
    ...
```

## Collecting Return Values

`send()` returns the return value from every subscriber as `[(receiver, return_value), ...]`:

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

Useful when multiple modules need to report status: fire one signal, collect all their results.

## Weak References

By default, blinker tracks subscribers with weak references — if the subscriber object is garbage collected, the connection is automatically removed:

```python
def temporary_handler(sender, **kwargs):
    pass

signal.connect(temporary_handler)
# when temporary_handler is GC'd, the connection disappears
```

To keep a connection alive (e.g., for lambdas or short-lived functions), use `weak=False`:

```python
signal.connect(lambda s, **kw: print(s), weak=False)
```

## Temporary Subscriptions (Testing)

```python
results = []

with order_completed.connected_to(lambda s, **kw: results.append(kw)):
    complete_order(order)

# auto-disconnected after the with block
assert len(results) == 1
```

Useful in tests when you don't want to pollute the global signal state.

## Async Support

blinker 1.7+ supports async subscribers:

```python
import asyncio

async def async_handler(sender, **kwargs):
    await send_notification(kwargs['order'])

order_completed.connect(async_handler)

await order_completed.send_async('service', _sync_wrapper=asyncio.coroutine, order=order)
```

## Namespace for Signal Collections

```python
from blinker import Namespace

order_signals = Namespace()
order_completed = order_signals.signal('completed')
order_cancelled = order_signals.signal('cancelled')
```

Group signals from the same module in a namespace to avoid name collisions and simplify imports:

```python
# orders/signals.py
from blinker import Namespace
signals = Namespace()
completed = signals.signal('completed')
cancelled = signals.signal('cancelled')

# in other modules
from orders.signals import completed
completed.connect(my_handler)
```

## Relationship to Flask Signals

Flask's request lifecycle signals are implemented with blinker:

```python
from flask import request_started, request_finished

@request_started.connect_via(app)
def on_request_started(sender, **kwargs):
    print(f"Request started: {request.path}")
```

This is the canonical blinker use case: the framework fires signals, your code subscribes, and the framework doesn't need to know what you're doing.

## Summary

blinker lets modules communicate through signals instead of direct calls. The sender doesn't know who's listening. The subscriber doesn't need to be imported by the sender.

Good fits:
- One event triggers multiple actions (order completed → email + inventory + log)
- Plugin architectures (core module doesn't know plugins exist)
- Breaking circular imports (A imports B, but B also needs to call something from A)
- Hooking into a specific point in time during tests
