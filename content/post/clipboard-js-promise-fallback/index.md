---
title: 'clipboard.js 包成 Promise：一個 function 搞定瀏覽器相容問題'
description: 'navigator.clipboard 在本機開發（非 HTTPS）和 iOS Safari 上常常失效。用 clipboard.js 包裝成統一的 Promise 介面，讓 fallback 對呼叫端透明，接到任何框架都一樣用法。'
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

本機開發時按下複製按鈕，console 噴 `NotAllowedError`。換到 iPhone 測，`navigator.clipboard` 直接是 `undefined`。這兩個情境都是同一個問題：`navigator.clipboard` 要求 **Secure Context**，也就是 HTTPS 或 `localhost`，但 iOS Safari 對 `localhost` 也不完全買帳。

解法很簡單，但要做得乾淨需要注意一件事：`navigator.clipboard.writeText()` 回傳的是 Promise，而 clipboard.js 的 `ClipboardJS.copy()` 是同步的。要讓這兩條路可以透明切換，就要把 fallback 也包成 Promise。

## 為什麼要統一 Promise 介面

`navigator.clipboard.writeText()` 的 signature：

```typescript
navigator.clipboard.writeText(text: string): Promise<void>
```

呼叫端用 `await` 或 `.then()` 接結果，語意清楚。如果 fallback 是同步的，呼叫端就要自己判斷走哪條路，邏輯散到各處。

包成同樣的 `Promise<void>`，呼叫端永遠只看到一個 function，底層走哪條路它不用知道。

## 完整實作

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

邏輯只有兩條：

1. `navigator.clipboard` 存在 → 直接 return，它本身就是 Promise
2. 不存在 → 用 `ClipboardJS.copy()` 執行複製，把同步結果包進 `new Promise`，成功 `resolve()`，拋錯 `reject()`

## 接到各種框架

有了這個 function，怎麼用完全由呼叫端決定。

**原生 JS**

```javascript
button.addEventListener('click', () => {
  copyToClipboard(button.dataset.text)
    .then(() => showToast('已複製'))
    .catch(() => showToast('複製失敗'));
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
    toast.success('已複製');
  } catch {
    toast.error('複製失敗');
  }
}
```

**自訂事件（適合 Livewire 或跨 component）**

後端或其他 component 透過 DOM 事件觸發，不需要直接 import function：

```typescript
document.addEventListener('clipboard', (e: Event) => {
  const { text } = (e as CustomEvent<{ text: string }>).detail;
  copyToClipboard(text)
    .then(() => notify('已複製'))
    .catch(() => notify('複製失敗'));
});
```

Livewire 觸發：

```php
$this->dispatch('clipboard', text: '要複製的內容');
```

## clipboard.js 的角色

[clipboard.js](https://github.com/zenorocha/clipboard.js) 底層用的是 `document.execCommand('copy')`，這條舊 API 不需要 Secure Context，在 HTTP 和 iOS 上都能動。它處理了 cross-browser 的邊界情況，省掉自己操作 `textarea` 的麻煩。

`execCommand` 雖然被標記為 deprecated，但目前所有主流瀏覽器還是支援，短期內不會消失。用它做 fallback 是目前最穩的方案。

## 安裝

```bash
npm install clipboard
```

TypeScript 型別已內建，不需要額外安裝 `@types/clipboard`。

## 參考資源

- [clipboard.js GitHub](https://github.com/zenorocha/clipboard.js)
- [Clipboard API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [Secure Context — MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
- [document.execCommand — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)
