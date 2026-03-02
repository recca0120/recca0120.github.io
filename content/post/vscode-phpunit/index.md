---
title: 'VS Code PHPUnit & Pest Test Explorer 完整設定指南'
description: 'PHPUnit & Pest Test Explorer 完整設定：Docker Compose、Sail、SSH、Xdebug 除錯，支援 PHPUnit 7-12 與 Pest 1-4。'
slug: vscode-phpunit
date: '2026-03-03T05:00:00+08:00'
image: featured.png
categories:
  - Testing
  - PHP
tags:
  - PHPUnit
  - Pest
  - VS Code
  - Docker
  - Testing
draft: false
---

我寫了一個 VS Code 擴充套件叫 [PHPUnit & Pest Test Explorer](https://marketplace.visualstudio.com/items?itemName=recca0120.vscode-phpunit)，目前累積了 26 萬多次安裝。這篇文章完整介紹它的功能和設定方式，包含 Pest 支援、Docker 整合、Xdebug 除錯等進階用法。

## 為什麼要寫這個擴充套件

PHPUnit 是 PHP 生態系最主流的測試框架，但在 VS Code 裡跑測試一直不太方便。要嘛開終端機手動敲指令，要嘛用其他擴充套件但功能陽春。我想要的是：直接在編輯器裡點一下就能跑單一測試，失敗了能直接跳到對應的程式碼，而且要能搭配 Docker 使用。

找不到滿意的工具，就自己寫了一個。

## 基本功能

裝好擴充套件之後，只要專案裡有 `phpunit.xml` 或 `phpunit.xml.dist`，它會自動偵測並在 VS Code 左側的 Test Explorer 面板列出所有測試。

支援的版本範圍很廣：

- PHPUnit 7 ~ 12
- Pest 1 ~ 4

### 跑測試

有幾種方式可以跑測試：

- 在 Test Explorer 面板點測試名稱旁邊的播放按鈕
- 在編輯器裡，測試方法上方會出現 Run / Debug 的 CodeLens
- 用快捷鍵：

| 快捷鍵 | 功能 |
|---------|------|
| `Cmd+T Cmd+T` | 跑游標所在的測試 |
| `Cmd+T Cmd+F` | 跑目前檔案的所有測試 |
| `Cmd+T Cmd+S` | 跑全部測試 |
| `Cmd+T Cmd+L` | 重跑上一次的測試 |

Windows / Linux 把 `Cmd` 換成 `Ctrl`。

### 測試輸出

測試結果會顯示在 VS Code 原生的 Test Results Panel。輸出格式有三種 preset 可以選：

- `collision`（預設）：每個測試獨立顯示，附帶語法高亮的 PHP 程式碼片段
- `progress`：傳統的點點點進度條
- `pretty`：每個測試一行，不帶 icon

```json
{
  "phpunit.output.preset": "collision"
}
```

錯誤訊息裡的 stack trace 可以直接點擊跳到對應的檔案和行號。`dd()` 的輸出也有語法高亮。

## Pest 支援

如果專案的 `composer.json` 裡有 `pestphp/pest`，擴充套件會自動偵測並改用 `vendor/bin/pest` 來跑測試。不需要額外設定。

手動指定也行：

```json
{
  "phpunit.phpunit": "vendor/bin/pest"
}
```

Pest 的 dataset 功能完整支援，包括：

- `->with()` 陣列資料集
- `->with()` 鏈式呼叫
- Generator-based 的 data provider
- 迴圈 yield 的 data provider

每個 dataset 的測試案例會在 Test Explorer 裡獨立顯示，可以單獨跑或除錯。

## Docker 環境整合

實際開發中，PHP 環境經常跑在 Docker 容器裡。這個擴充套件透過 `phpunit.command` 和 `phpunit.paths` 兩個設定，支援各種遠端執行場景。

核心概念：`phpunit.command` 定義怎麼執行測試指令，`phpunit.paths` 做本機路徑和容器路徑的對應。

### Docker Compose

最常見的情境。假設你的 `docker-compose.yml` 有一個 `app` 服務，PHP 程式碼掛載在容器的 `/app`：

```json
{
  "phpunit.command": "docker compose exec -t app /bin/sh -c \"${php} ${phpargs} ${phpunit} ${phpunitargs}\"",
  "phpunit.paths": {
    "${workspaceFolder}": "/app"
  }
}
```

`-t` 參數讓容器分配一個 pseudo-TTY，這樣輸出才會有顏色。

### docker exec（已啟動的容器）

如果容器已經在跑，直接 exec 進去：

```json
{
  "phpunit.command": "docker exec -t my_container /bin/sh -c \"${php} ${phpargs} ${phpunit} ${phpunitargs}\"",
  "phpunit.paths": {
    "${workspaceFolder}": "/app"
  }
}
```

### docker run（臨時容器）

跑完就丟的一次性容器：

```json
{
  "phpunit.command": "docker run --rm -t -v ${PWD}:/app -w /app php:latest ${php} ${phpargs} ${phpunit} ${phpunitargs}",
  "phpunit.paths": {
    "${workspaceFolder}": "/app"
  }
}
```

### 多工作區共用容器

如果你用 VS Code 的 Multi-root Workspace，多個專案共用同一個 Docker 容器，可以用 `${workspaceFolderBasename}` 變數來動態切換目錄：

```json
{
  "phpunit.command": "docker exec -t vscode-phpunit /bin/sh -c \"cd /${workspaceFolderBasename} && ${php} ${phpargs} ${phpunit} ${phpunitargs}\"",
  "phpunit.paths": {
    "${workspaceFolder}": "/${workspaceFolderBasename}"
  }
}
```

這樣每個工作區會自動對應到容器裡對應名稱的目錄。

## Laravel Sail

Laravel Sail 本質上就是 Docker Compose 的包裝，設定方式類似但有幾個差異：

```json
{
  "phpunit.command": "docker compose exec -u sail laravel.test ${php} ${phpargs} ${phpunit} ${phpunitargs}",
  "phpunit.phpunit": "artisan test",
  "phpunit.paths": {
    "${workspaceFolder}": "/var/www/html"
  }
}
```

注意幾個重點：

- 用 `-u sail` 指定使用者，不然會用 root 跑，權限會亂掉
- 容器名稱是 `laravel.test`（Sail 的預設）
- `phpunit.phpunit` 設成 `artisan test` 而不是 `vendor/bin/phpunit`，這樣 Laravel 的環境設定（`.env.testing`）才會正確載入
- 路徑對應到 `/var/www/html`

## SSH 遠端執行

如果測試環境在遠端伺服器上：

```json
{
  "phpunit.command": "ssh user@host \"cd /app; ${php} ${phpargs} ${phpunit} ${phpunitargs}\"",
  "phpunit.paths": {
    "${workspaceFolder}": "/app"
  }
}
```

## DDEV

用 DDEV 的話最簡單，不需要路徑對應：

```json
{
  "phpunit.command": "ddev exec ${php} ${phpargs} ${phpunit} ${phpunitargs}"
}
```

## WSL + Docker

在 Windows 上用 WSL 搭配 Docker 的情境：

```json
{
  "phpunit.command": "docker exec -t my_container /bin/sh -c \"${php} ${phpargs} ${phpunit} ${phpunitargs}\"",
  "phpunit.paths": {
    "//wsl.localhost/Ubuntu/var/www/myproject": "/var/www/myproject"
  }
}
```

路徑要用 `//wsl.localhost/` 開頭的 UNC 路徑。

## Xdebug 除錯

點 Test Explorer 裡的 Debug 按鈕就能觸發 Xdebug 逐步除錯。設定步驟：

### 1. 建立 launch.json

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Listen for Xdebug",
      "type": "php",
      "request": "launch",
      "port": 9003,
      "pathMappings": {
        "/app": "${workspaceFolder}"
      }
    }
  ]
}
```

如果是 Docker 環境，`pathMappings` 要跟 `phpunit.paths` 反過來填。

### 2. 指定 debugger 設定

```json
{
  "phpunit.debuggerConfig": "Listen for Xdebug"
}
```

名稱要跟 `launch.json` 裡的 `name` 完全一致。

### 3. PHP 端設定

確認 `php.ini` 或 Docker 環境變數裡有：

```ini
xdebug.mode = debug
xdebug.start_with_request = yes
xdebug.client_host = host.docker.internal  ; Docker 環境才需要
xdebug.client_port = 9003
```

如果用 `start_with_request = trigger` 而不是 `yes`，需要在 `phpunit.command` 裡帶上 `XDEBUG_TRIGGER` 環境變數。

### Xdebug port 設定

預設 `phpunit.xdebugPort` 是 `0`，表示隨機分配。如果需要固定 port：

```json
{
  "phpunit.xdebugPort": 9003
}
```

## ParaTest 平行執行

想加速測試可以搭配 ParaTest：

```json
{
  "phpunit.phpunit": "vendor/bin/paratest"
}
```

## 其他實用設定

### 自動儲存再跑測試

```json
{
  "phpunit.saveBeforeTest": true
}
```

### 自訂環境變數

```json
{
  "phpunit.environment": {
    "APP_ENV": "testing",
    "DB_CONNECTION": "sqlite"
  }
}
```

### 額外的 PHPUnit 參數

```json
{
  "phpunit.args": [
    "--configuration", "${workspaceFolder}/phpunit.xml.dist",
    "--no-coverage"
  ]
}
```

### 用 Laravel Artisan 跑測試（非 Sail）

```json
{
  "phpunit.phpunit": "artisan test"
}
```

## command 模板變數一覽

`phpunit.command` 裡可以用這些變數：

| 變數 | 說明 |
|------|------|
| `${php}` | PHP 執行檔路徑 |
| `${phpargs}` | PHP 參數 |
| `${phpunit}` | PHPUnit/Pest 執行檔路徑 |
| `${phpunitargs}` | PHPUnit 參數（含 filter、configuration 等） |
| `${phpunitxml}` | phpunit.xml 的路徑 |
| `${cwd}` | 目前工作目錄 |
| `${workspaceFolder}` | VS Code workspace 目錄的完整路徑 |
| `${workspaceFolderBasename}` | workspace 目錄名稱（不含路徑） |
| `${userHome}` | 使用者家目錄 |
| `${pathSeparator}` | 路徑分隔符號（`/` 或 `\`） |

## 自動偵測和重新載入

擴充套件會在這些時候自動重新載入測試清單：

- `phpunit.xml` 或 `phpunit.xml.dist` 被修改
- `composer.lock` 有變動（可能切換了 PHPUnit / Pest 版本）
- 測試檔案新增或刪除

如果需要手動觸發，可以用 Command Palette 執行 `PHPUnit: Reload tests`。

擴充套件的啟動條件是 workspace 裡有任何 `*.php` 檔案。沒有 PHP 檔案的專案不會載入這個擴充套件，不影響效能。
