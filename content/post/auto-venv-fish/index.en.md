---
title: 'auto-venv: Fish Shell Auto-Activates Python Virtualenvs on cd'
date: '2026-03-21T09:00:00+08:00'
slug: auto-venv-fish
description: 'auto-venv is a Fish shell plugin that automatically activates and deactivates Python venvs on directory change. Supports .venv, venv, .env, env naming, uses git root for scope, and works with z, zoxide, and any other navigation tool.'
categories:
  - Backend
tags:
  - fish
  - python
  - venv
  - automation
  - shell
  - virtualenv
---

Every time you `cd` into a Python project, you manually run `source .venv/bin/activate.fish`.
Leaving means remembering to `deactivate`.
Jumping with `z` is worse — the venv never activates at all.
[auto-venv](https://github.com/nakulj/auto-venv) handles all of it. Enter a directory and the venv activates. Leave and it deactivates.

## Installation

With [fisher](https://github.com/jorgebucaran/fisher):

```fish
fisher install nakulj/auto-venv
```

Or manually:

```fish
cp venv.fish ~/.config/fish/conf.d/venv.fish
```

Restart your terminal or run `source ~/.config/fish/config.fish` to apply.

## How It Works

### Watching PWD Instead of Overriding cd

This is the most important design decision. Most venv auto-activation tools override the `cd` builtin, which means tools like `z`, `zoxide`, and `pushd` bypass the hook entirely — the venv never activates.

`auto-venv` watches Fish's special `$PWD` variable instead. Any directory change, regardless of how it happened, fires the handler:

```fish
function __auto_source_venv --on-variable PWD
  status --is-command-substitution; and return
  __handle_venv_activation (__venv_base)
end
```

The `status --is-command-substitution; and return` guard prevents it from firing inside `$(...)` subshells.

### Using the Git Root as the Lookup Base

```fish
function __venv_base
  git rev-parse --show-toplevel 2>/dev/null; or pwd
end
```

Inside a git repository, the venv is always looked up at the **repo root** — not the current subdirectory. So navigating from `myproject/` into `myproject/src/utils/` keeps the venv active. Outside a git repo, it falls back to `pwd`.

### Recognizing Four venv Names

```fish
function __venv --argument-names dir
  set VENV_DIR_NAMES env .env venv .venv
  for venv_dir in $dir/$VENV_DIR_NAMES
    if test -e "$venv_dir/bin/activate.fish"
      echo "$venv_dir"
      return
    end
  end
  return 1
end
```

It searches `env`, `.env`, `venv`, `.venv` in that order, checking for the existence of `bin/activate.fish`. Returns the first match.

### Activation and Deactivation Logic

```fish
function __handle_venv_activation --argument-names dir
  set -l venv_dir (__venv $dir); or begin
    # No venv found — deactivate the current one if there is one
    set -q VIRTUAL_ENV; and deactivate
    return
  end

  # Avoid re-activating the same venv
  if test "$VIRTUAL_ENV" != "$venv_dir"
    source "$venv_dir/bin/activate.fish"
  end
end
```

Three cases:

1. **Venv found, different from current** → activate it (`activate.fish` deactivates the old one internally)
2. **Venv found, same as current** → do nothing (navigating within the same project doesn't re-source)
3. **No venv found** → deactivate if one is active

## In Practice

```fish
# Enter a project with .venv — auto-activates
cd ~/projects/my-api
# (my-api) ← venv name in prompt

# Navigate into a subdirectory — venv stays
cd src/controllers
# (my-api) ← still active

# Switch to another project with its own venv — auto-switches
cd ~/projects/ml-project
# (ml-project) ← switched

# Leave to a directory with no venv — auto-deactivates
cd ~
# ← prompt back to normal, venv deactivated

# Works with z too
z my-api
# (my-api) ← auto-activated
```

## Configuration

auto-venv has no configuration. The venv directory names are hardcoded (`env`, `.env`, `venv`, `.venv`). If your project uses a different name (e.g., `.python-env`), fork the repo and edit the `VENV_DIR_NAMES` list in `__venv`.

## Limitations

- Only supports standard Python venvs (`python -m venv`, `virtualenv`) — detection relies on `bin/activate.fish` existing
- conda environments are not supported — conda has its own activation mechanism
- pyenv-virtualenv is not supported for the same reason

## Manual vs auto-venv

| Scenario | Manual | auto-venv |
|---|---|---|
| cd into project | Must source activate.fish | Auto-activates |
| Navigate subdirectories | Venv stays (no deactivate) | Venv stays |
| cd out of project | Must remember to deactivate | Auto-deactivates |
| Jump with z/zoxide | Venv doesn't activate | Auto-activates |
| Switch between projects | Deactivate then activate | Auto-switches |

## Summary

The entire plugin is under 40 lines. Watching `$PWD` instead of overriding `cd` makes it compatible with every navigation tool. Using the git root as the lookup base means moving between subdirectories never accidentally kills the venv. Once installed, you stop thinking about virtual environment management entirely.
