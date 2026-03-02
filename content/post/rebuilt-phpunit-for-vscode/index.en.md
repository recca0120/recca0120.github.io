---
title: 'PHPUnit for VSCode 3.0: Testing API Integration and Docker Support'
description: 'A full rewrite of PHPUnit for VSCode integrating the VS Code Testing API for real-time sidebar results, with Docker and SSH remote execution support.'
slug: rebuilt-phpunit-for-vscode
date: '2022-12-06T05:57:57+08:00'
categories:
  - Testing
  - PHP
tags:
  - PHPUnit
  - PHP
  - VS Code
  - Docker
  - Testing
image: featured.png
draft: false
---

VSCode released a new Testing API, and the 2.0 version wasn't designed with Docker and SSH use cases in mind, so I completely rewrote [PHPUnit For VSCode](https://marketplace.visualstudio.com/items?itemName=recca0120.vscode-phpunit).

## Improvements in 3.0

**VSCode Testing API Integration**: The test list shows directly in the VSCode sidebar, and error messages are displayed inline in the editor.

**PHPUnit Output Formatting**: Switched to parsing the TeamCity protocol, reporting results in real time as each TestCase completes, unlike 2.0 which required waiting for the entire run to finish.

**Docker Support**:

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

**SSH Support**:

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

Feel free to file an issue on [GitHub](https://github.com/recca0120/vscode-phpunit) if you run into any problems.
