---
title: 'PHP goto 不是邪魔：用來寫 retry 比 while 少一層縮排'
date: '2026-03-18T09:00:00+08:00'
slug: php-goto-retry
description: 'PHP goto 語法在 retry 邏輯上比 while loop 更直覺：少一層縮排、流程更平坦、語意更精確。只有明確要重試才跳回去，成功直接 return，失敗次數用完才 throw。'
categories:
  - 後端
tags:
  - php
  - goto
  - retry
  - pattern
---

寫 retry 邏輯，第一個念頭通常是 `while (true)`。能跑，但 try/catch 被包在迴圈裡，多一層縮排，邏輯也不是最直覺。
PHP 有 `goto`，大部分人看到就想跳過。但用在 retry 這個場景，它比 `while` 少一層、語意更清楚。

## while 版本

常見的寫法：

```php
while (true) {              // 第一層：迴圈
    try {                   // 第二層：try
        $client = new Client();
        $response = $client->request($method, $uri, array_filter([
            'form_params' => $form_params,
            'multipart'   => $multipart,
        ]));

        return json_decode($response->getBody(), associative: true);

    } catch (ConnectException $e) {
        $times--;
        if (! $times) {
            throw $e;       // 次數用完才真的丟出去
        }
        usleep(3000);
        // 繼續下一圈 while
    }
}
```

能跑，沒問題。但有幾個地方稍微彆扭：

1. `while (true)` 只是為了「讓程式跳回去」，不帶任何業務語意
2. try/catch 整個往右推一格，程式碼長的時候很明顯
3. 成功路徑靠 `return` 跳出迴圈，算是側門出去，不是正門

## goto 版本

```php
beginning:                  // 標籤，goto 的跳躍目標
try {                       // 直接在頂層，少一層縮排
    $client = new Client();
    $response = $client->request($method, $uri, array_filter([
        'form_params' => $form_params,
        'multipart'   => $multipart,
    ]));

    return json_decode($response->getBody(), associative: true);

} catch (ConnectException $e) {
    $times--;
    if (! $times) {
        throw $e;           // 次數用完就丟
    }
    usleep(microseconds: 3000);
    goto beginning;         // 明確說「重試」，跳回標籤
}
```

流程很直白：

- 成功 → `return`
- 失敗且還有次數 → `goto beginning` 重試
- 失敗且次數用完 → `throw`

只有**明確要重試**的時候才跳，沒有「靠迴圈繼續跑」這種隱含邏輯。

## 兩者的差異

```
while 版本：
└── while(true)        ← 第一層
    └── try { ... }    ← 第二層
        └── catch

goto 版本：
└── try { ... }        ← 第一層（頂層）
    └── catch
        └── goto beginning
```

少的那一層在 try block 很長的時候特別有感。不是說 `while` 寫法不好，只是 `goto` 在這個模式下結構更平坦。

## goto 的限制

PHP 的 `goto` 有幾個規則要注意：

```php
// ✓ 可以跳進同一個函式內的標籤
function doRequest() {
    retry:
    try { ... }
    catch (...) { goto retry; }
}

// ✗ 不能跳進迴圈或 switch 內部
for (...) {
    inside:   // 不能從外面 goto 跳到這裡
}

// ✗ 不能跨函式
function a() { goto label; }
function b() { label: ... }  // 不行
```

只要跳躍目標在同一個函式內、不是跳進迴圈/switch 內部，就沒問題。

## 為什麼 goto 被視為反模式

歷史原因。C 語言時代大量濫用 `goto` 寫出意大利麵式程式碼，Dijkstra 1968 年寫了那篇著名的「Go To Statement Considered Harmful」，從此 `goto` 就跟爛程式碼掛勾。

但這個評價針對的是**任意跳躍**，不是所有 `goto` 用法。用 `goto` 往回跳做 retry，跳躍範圍明確、語意清楚，跟那種滿天飛的 `goto` 完全不同。

實務上，C 語言的 kernel 程式碼到現在還在用 `goto` 做 cleanup 路徑，PHP 的 Symfony、Laravel 框架原始碼裡也有少量 `goto`。

## 什麼時候適合用

`goto` 的 retry 模式適合這個情境：

- 有固定重試次數
- 只有特定 exception 才重試（這裡是 `ConnectException`）
- 重試之間需要等待（`usleep`）
- 邏輯簡單，跳躍目標清楚

如果重試邏輯更複雜，或需要指數退避（exponential backoff），就封裝成 helper function 更適合，不要硬塞進 `goto`。

## 小結

`goto` 不是不能碰，是要用在對的地方。retry 這個模式，跳躍目標明確、只往回跳、不橫跨函式，用 `goto` 比 `while (true)` 的意圖更直接，縮排也少一層。

見到 `goto` 先別嚇跑，看一下跳哪裡、為什麼跳，再決定要不要改。
