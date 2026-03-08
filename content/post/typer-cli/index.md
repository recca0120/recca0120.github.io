---
title: 'Typer：用 type hint 寫 CLI，不需要記 argparse API'
date: '2026-04-02T09:00:00+08:00'
slug: typer-cli
description: 'Typer 是 FastAPI 同作者寫的 CLI 框架，底層是 Click，但你不需要學 Click API。Type hint 就是 CLI 的規格，自動產生 help、shell 補全、子命令，把一堆 scripts 整理成一個工具。'
categories:
  - Python
tags:
  - typer
  - cli
  - python
  - click
  - argparse
  - automation
---

在專案裡累積了幾個 Python script 之後，總有一天你會想把它們整理成一個 CLI 工具。

常見的做法是用 `argparse`，但 `argparse` 的 API 很囉嗦：要 `add_argument`、設 `type`、設 `help`、parse 完再取值……一個簡單的 CLI 要寫很多行。

[Typer](https://typer.tiangolo.com/) 的做法是：type hint 就是規格，函式簽名就是 CLI 介面，`help` 從 docstring 來，不需要另外宣告。

FastAPI 同作者，設計邏輯完全一致。

## 安裝

```bash
pip install typer
```

## 最簡單的用法

```python
# main.py
import typer

def main(name: str, count: int = 1):
    for _ in range(count):
        print(f"Hello {name}")

if __name__ == "__main__":
    typer.run(main)
```

```bash
python main.py Alice
# Hello Alice

python main.py Alice --count 3
# Hello Alice
# Hello Alice
# Hello Alice

python main.py --help
# Usage: main.py [OPTIONS] NAME
# Arguments: NAME  [required]
# Options: --count INTEGER  [default: 1]
```

`name: str` 沒有預設值，變成必填的 positional argument。`count: int = 1` 有預設值，變成可選的 `--count` option。

就這樣，不需要宣告任何 argument parser。

## 多個子命令

```python
import typer

app = typer.Typer()

@app.command()
def deploy(env: str, force: bool = False):
    """Deploy to an environment."""
    if force:
        typer.echo(f"Force deploying to {env}")
    else:
        typer.echo(f"Deploying to {env}")

@app.command()
def rollback(env: str, version: str):
    """Rollback to a specific version."""
    typer.echo(f"Rolling back {env} to {version}")

if __name__ == "__main__":
    app()
```

```bash
python main.py deploy production
python main.py deploy staging --force
python main.py rollback production v1.2.3

python main.py --help
# Available commands: deploy, rollback

python main.py deploy --help
# Deploy to an environment.
# Arguments: ENV  [required]
# Options: --force / --no-force  [default: no-force]
```

docstring 直接變成 `--help` 的說明，不用另外寫。

bool 型別自動產生 `--force` 和 `--no-force` 兩個選項。

## Argument vs Option

```python
@app.command()
def process(
    filename: str,                      # positional argument（必填）
    output: str = "output.txt",         # --output（有預設值）
    verbose: bool = False,              # --verbose / --no-verbose
    workers: int = typer.Option(4, help="Number of workers"),  # 帶說明
):
    ...
```

- 沒有預設值 → positional argument，使用者直接傳，不加 `--`
- 有預設值 → option，使用者用 `--name value` 傳
- `bool` → flag，自動產生 `--flag` / `--no-flag`

## Prompt 和確認

```python
@app.command()
def delete(name: str, confirm: bool = typer.Option(False, prompt="Are you sure?")):
    if confirm:
        typer.echo(f"Deleted {name}")
```

```bash
python main.py delete mydb
# Are you sure? [y/N]: y
# Deleted mydb
```

危險操作加 `prompt=True` 或 `prompt="..."` 就自動詢問。

## 顏色輸出

```python
def check(service: str):
    if is_running(service):
        typer.echo(typer.style("✓ Running", fg=typer.colors.GREEN))
    else:
        typer.echo(typer.style("✗ Stopped", fg=typer.colors.RED, bold=True))
```

## 進度條

```python
import time

@app.command()
def process(items: int = 100):
    with typer.progressbar(range(items), label="Processing") as progress:
        for _ in progress:
            time.sleep(0.01)
```

不需要安裝其他套件，Typer 內建。

## 嵌套子命令

大型工具可以把命令分群：

```python
app = typer.Typer()
users_app = typer.Typer()
orders_app = typer.Typer()

app.add_typer(users_app, name="users")
app.add_typer(orders_app, name="orders")

@users_app.command("list")
def list_users():
    ...

@orders_app.command("list")
def list_orders():
    ...
```

```bash
python main.py users list
python main.py orders list
```

## Shell 自動補全

```bash
# 安裝到目前的 shell
python main.py --install-completion

# 顯示補全腳本（不安裝）
python main.py --show-completion
```

Bash、Zsh、Fish、PowerShell 都支援，執行一次就搞定。

## 跟 argparse / Click 的比較

| | argparse | Click | Typer |
|---|---|---|---|
| 宣告方式 | add_argument() | @click.option() | type hint |
| Help 文字 | 手動設定 | 手動設定 | docstring 自動 |
| 型別轉換 | 手動設 type= | 手動設 type= | 自動推斷 |
| 子命令 | subparsers | 多個 command | @app.command() |
| 學習成本 | 中 | 中 | 低 |

Typer 底層是 Click，Click 的生態系（plugin、testing）都可以用。

## 我的用法

我習慣把散落的 scripts 整理成一個 CLI：

```
project/
├── cli.py          # app = typer.Typer()，各命令從這裡進入
├── commands/
│   ├── db.py       # database 相關命令
│   ├── deploy.py   # 部署相關
│   └── seed.py     # 測試資料
```

```python
# cli.py
import typer
from commands import db, deploy, seed

app = typer.Typer()
app.add_typer(db.app, name="db")
app.add_typer(deploy.app, name="deploy")
app.add_typer(seed.app, name="seed")
```

以前一堆 `python scripts/seed_db.py --env staging --users 100` 現在變成 `python cli.py seed users --env staging --count 100`，統一入口，`--help` 就能找到所有命令。

## 小結

Typer 讓 Python type hint 直接定義 CLI 介面。不需要學另一套 API，寫起來就像寫普通函式。

適合用來：
- 整理散落的 admin scripts
- 給內部工具加上正式的 CLI
- 需要 shell 自動補全的場景
