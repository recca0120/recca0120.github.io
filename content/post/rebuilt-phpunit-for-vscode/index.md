---
title: 'Rebuilt PHPUnit for VSCode (New Version 3.0)'
description: 'PHPUnit for VSCode 3.0 重寫版，整合 Testing API、即時回報測試結果，並支援 Docker 和 SSH 執行環境。'
slug: rebuilt-phpunit-for-vscode
date: '2022-12-06T05:57:57+08:00'
categories:
- Testing
tags:
- PHPUnit
- VS Code
- Docker
image: featured.png
draft: false
---

VSCode 推出了新版 Testing API，加上 2.0 版當初設計時沒有考慮 Docker 和 SSH 的使用情境，所以我把 [PHPUnit For VSCode](https://marketplace.visualstudio.com/items?itemName=recca0120.vscode-phpunit) 整個重寫了。

## 3.0 版的改進

**VSCode Testing API 整合**：測試列表直接顯示在 VSCode 側邊欄，錯誤訊息也能直接在編輯器內呈現。

**PHPUnit Output 美化**：改用 parse TeamCity protocol，每完成一個 TestCase 就即時回報結果，不像 2.0 版要等全部跑完才知道。

**Docker Support**：

```json
{
  "phpunit.command": "docker run --rm -t -v ${pwd}:/app -w /app php:latest php",
  "phpunit.php": "php",
  "phpunit.phpunit": "vendor/bin/phpunit",
  "phpunit.args": [
    "-c",
    "phpunit.xml"
  ],
  "phpunit.paths": {
    "${workspaceFolder}": "/app"
  }
}
```

**SSH Support**：

```json
{
  "phpunit.command": "ssh -i dockerfiles/sshd/id_rsa -p 2222 root@localhost -o StrictHostKeyChecking=no",
  "phpunit.php": "php",
  "phpunit.phpunit": "/app/vendor/bin/phpunit",
  "phpunit.args": [
    "-c",
    "/app/phpunit.xml"
  ],
  "phpunit.paths": {
    "${workspaceFolder}": "/app"
  }
}
```

有問題歡迎到 [GitHub](https://github.com/recca0120/vscode-phpunit) 上提 issue。
