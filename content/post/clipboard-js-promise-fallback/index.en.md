---
title: 'Wrapping clipboard.js as a Promise: One Function for All Browser Compatibility'
description: 'navigator.clipboard fails on non-HTTPS local dev and iOS Safari. Wrap clipboard.js into a unified Promise interface so the fallback is transparent to callers and works with any framework.'
slug: clipboard-js-promise-fallback
date: '2026-04-16T23:00:00+08:00'
image: featured.png
categories:
- Frontend
tags:
- clipboard.js
- JavaScript
- TypeScript
draft: false
---

You click a copy button during local development and see `NotAllowedError` in the console. Switch to iPhone for testing and `navigator.clipboard` is flat-out `undefined`. Both situations share the same root cause: `navigator.clipboard` requires a **Secure Context** — HTTPS or `localhost` — but iOS Safari doesn't fully honor `localhost` either.

The fix is straightforward, but doing it cleanly requires one thing: `navigator.clipboard.writeText()` returns a Promise, while clipboard.js's `ClipboardJS.copy()` is synchronous. To make both paths transparently interchangeable, the fallback needs to be wrapped as a Promise too.

## Why a Unified Promise Interface Matters

The signature of `navigator.clipboard.writeText()`:

```typescript
navigator.clipboard.writeText(text: string): Promise<void>
```

Callers use `await` or `.then()` — clear and consistent. If the fallback is synchronous, callers have to detect which path to take themselves, scattering that logic everywhere.

Wrapping everything into the same `Promise<void>` means callers always see one function. Which path runs underneath is none of their business.

## The Implementation

```typescript
import ClipboardJS from 'clipboard';

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    try {
      ClipboardJS.copy(text);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
```

Two paths only:

1. `navigator.clipboard` exists → return it directly, it's already a Promise
2. Doesn't exist → run `ClipboardJS.copy()`, wrap the synchronous result in `new Promise`, `resolve()` on success, `reject()` on error

## Integrating with Any Framework

With this function, how you use it is entirely up to the caller.

**Vanilla JS**

```javascript
button.addEventListener('click', () => {
  copyToClipboard(button.dataset.text)
    .then(() => showToast('Copied!'))
    .catch(() => showToast('Copy failed'));
});
```

**Alpine.js**

```html
<button @click="copyToClipboard($el.dataset.text).then(() => copied = true)">
  Copy
</button>
```

**Vue**

```typescript
async function handleCopy(text: string) {
  try {
    await copyToClipboard(text);
    toast.success('Copied!');
  } catch {
    toast.error('Copy failed');
  }
}
```

**Custom Event (for Livewire or cross-component use)**

Trigger via DOM event — no direct import needed:

```typescript
document.addEventListener('clipboard', (e: Event) => {
  const { text } = (e as CustomEvent<{ text: string }>).detail;
  copyToClipboard(text)
    .then(() => notify('Copied!'))
    .catch(() => notify('Copy failed'));
});
```

Livewire dispatch:

```php
$this->dispatch('clipboard', text: 'content to copy');
```

## The Role of clipboard.js

[clipboard.js](https://github.com/zenorocha/clipboard.js) uses `document.execCommand('copy')` under the hood — an older API that doesn't require a Secure Context and works on both HTTP and iOS. It handles cross-browser edge cases, saving you from manually wiring up a `textarea`.

`execCommand` is marked deprecated, but all major browsers still support it and it isn't going away anytime soon. It remains the most reliable fallback available.

## Installation

```bash
npm install clipboard
```

TypeScript types are bundled — no separate `@types/clipboard` needed.

## References

- [clipboard.js GitHub](https://github.com/zenorocha/clipboard.js)
- [Clipboard API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [Secure Context — MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
- [document.execCommand — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)
