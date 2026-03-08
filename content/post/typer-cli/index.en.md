---
title: 'Typer: Build CLIs With Type Hints, No argparse API to Memorize'
date: '2026-04-02T09:00:00+08:00'
slug: typer-cli
image: cover.jpg
description: "Typer is a CLI framework by the FastAPI author, built on Click, but you don't need to learn Click's API. Type hints are the CLI specification — help text, shell completion, and subcommands are generated automatically."
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

After accumulating scripts in a project, at some point you want to consolidate them into one CLI tool.

The standard approach is `argparse`, but argparse is verbose: `add_argument`, set `type`, set `help`, parse, then retrieve values — a simple CLI takes many lines.

[Typer](https://typer.tiangolo.com/)'s approach: type hints are the specification, the function signature is the CLI interface, `help` comes from docstrings. Nothing to declare separately.

Same author as FastAPI. Same design logic.

## Install

```bash
pip install typer
```

## The Simplest Case

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

`name: str` has no default — becomes a required positional argument. `count: int = 1` has a default — becomes an optional `--count` option. No argument parser declarations needed.

## Multiple Subcommands

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
```

The docstring becomes the `--help` description automatically.

`bool` types auto-generate both `--force` and `--no-force` options.

## Arguments vs Options

```python
@app.command()
def process(
    filename: str,                      # positional argument (required)
    output: str = "output.txt",         # --output (has default)
    verbose: bool = False,              # --verbose / --no-verbose
    workers: int = typer.Option(4, help="Number of workers"),  # with description
):
    ...
```

- No default → positional argument, passed directly without `--`
- Has default → option, passed as `--name value`
- `bool` → flag, auto-generates `--flag` / `--no-flag`

## Prompts and Confirmation

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

Add `prompt=True` or `prompt="..."` to dangerous operations for automatic confirmation.

## Colored Output

```python
def check(service: str):
    if is_running(service):
        typer.echo(typer.style("✓ Running", fg=typer.colors.GREEN))
    else:
        typer.echo(typer.style("✗ Stopped", fg=typer.colors.RED, bold=True))
```

## Progress Bar

```python
import time

@app.command()
def process(items: int = 100):
    with typer.progressbar(range(items), label="Processing") as progress:
        for _ in progress:
            time.sleep(0.01)
```

Built in, no extra packages.

## Nested Subcommands

For larger tools, group commands:

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

## Shell Completion

```bash
# install into current shell
python main.py --install-completion

# show the completion script without installing
python main.py --show-completion
```

Bash, Zsh, Fish, and PowerShell supported. One command, done.

## Compared to argparse / Click

| | argparse | Click | Typer |
|---|---|---|---|
| Declaration | add_argument() | @click.option() | type hints |
| Help text | manual | manual | from docstring |
| Type conversion | set type= | set type= | inferred |
| Subcommands | subparsers | multiple commands | @app.command() |
| Learning curve | medium | medium | low |

Typer is built on Click, so Click's ecosystem (plugins, testing utilities) still works.

## How I Use It

I consolidate scattered scripts into a single CLI:

```
project/
├── cli.py          # app = typer.Typer(), entry point
├── commands/
│   ├── db.py       # database commands
│   ├── deploy.py   # deployment
│   └── seed.py     # test data
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

What used to be `python scripts/seed_db.py --env staging --users 100` becomes `python cli.py seed users --env staging --count 100`. Single entry point, `--help` discovers everything.

## Summary

Typer maps Python type hints directly to CLI interfaces. No new API to learn — it reads like normal functions.

Good for:
- Consolidating scattered admin scripts
- Giving internal tools a proper CLI
- Anything where shell completion would be useful
