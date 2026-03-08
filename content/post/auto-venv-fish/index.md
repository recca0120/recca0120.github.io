---
title: 'auto-venv：Fish Shell 自動啟用 Python 虛擬環境，cd 進去就好'
date: '2026-03-21T09:00:00+08:00'
slug: auto-venv-fish
description: 'auto-venv 是 Fish shell plugin，切換目錄時自動啟用和關閉 Python venv，支援 .venv、venv、.env、env 四種命名，用 git root 判斷範圍，相容 z、zoxide 等跳轉工具。'
categories:
  - Python
  - Tools
tags:
  - fish
  - python
  - venv
  - automation
  - shell
  - virtualenv
---

每次 `cd` 進 Python 專案都要手動 `source .venv/bin/activate.fish`。
離開專案還要記得 `deactivate`。
用 `z` 跳過去更麻煩，venv 完全不會啟動。
[auto-venv](https://github.com/nakulj/auto-venv) 解決這些，進去自動啟用，出去自動關閉。

## 安裝

用 [fisher](https://github.com/jorgebucaran/fisher)：

```fish
fisher install nakulj/auto-venv
```

或手動複製：

```fish
cp venv.fish ~/.config/fish/conf.d/venv.fish
```

安裝完重開 terminal 或執行 `source ~/.config/fish/config.fish` 即可。

## 運作方式

### 監聽 PWD 而不是覆寫 cd

這是設計上最重要的一個決定。一般的 venv 自動啟用工具會覆寫 `cd` 指令，導致 `z`、`zoxide`、`pushd` 這些跳轉工具切換目錄時 venv 不會自動啟動。

`auto-venv` 改為監聽 Fish 的特殊變數 `$PWD`，只要目錄改變（不論透過什麼方式）就會觸發：

```fish
function __auto_source_venv --on-variable PWD
  status --is-command-substitution; and return
  __handle_venv_activation (__venv_base)
end
```

`status --is-command-substitution; and return` 這行防止它在 `$(...)` 的 subshell 裡觸發。

### 用 git root 當判斷基準

```fish
function __venv_base
  git rev-parse --show-toplevel 2>/dev/null; or pwd
end
```

在 git 專案裡，不管你在哪個子目錄，都是找 **repo 根目錄** 的 venv。所以從 `myproject/` 進到 `myproject/src/utils/`，venv 不會關掉，繼續保持啟用。不在 git repo 裡就 fallback 到 `pwd`。

### 辨識四種 venv 命名

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

依序找 `env`、`.env`、`venv`、`.venv`，判斷方式是檢查 `bin/activate.fish` 是否存在。找到第一個就回傳，不繼續往下找。

### 啟用和關閉邏輯

```fish
function __handle_venv_activation --argument-names dir
  set -l venv_dir (__venv $dir); or begin
    # 找不到 venv，如果目前有啟用的就關掉
    set -q VIRTUAL_ENV; and deactivate
    return
  end

  # 避免重複啟用同一個 venv
  if test "$VIRTUAL_ENV" != "$venv_dir"
    source "$venv_dir/bin/activate.fish"
  end
end
```

三種情況：

1. **找到 venv，跟目前的不同** → 啟用新的（`activate.fish` 內部會先 deactivate 舊的）
2. **找到 venv，跟目前的一樣** → 什麼都不做（在專案內部換目錄時不重複啟用）
3. **找不到 venv** → 如果有啟用的就關掉

## 實際使用

```fish
# 進到有 .venv 的 Python 專案，自動啟用
cd ~/projects/my-api
# (my-api) ← prompt 顯示 venv 名稱

# 在子目錄繼續工作，venv 不會關掉
cd src/controllers
# (my-api) ← 還在

# 切換到另一個有 venv 的專案，自動換
cd ~/projects/ml-project
# (ml-project) ← 換了

# 離開到沒有 venv 的目錄，自動關閉
cd ~
# ← prompt 回復正常，venv 已 deactivate

# 用 z 跳轉也一樣有效
z my-api
# (my-api) ← 自動啟用
```

## 設定

auto-venv 沒有設定選項，venv 目錄名稱是寫死的（`env`、`.env`、`venv`、`.venv`）。如果你的專案用其他命名（例如 `.python-env`），要自己 fork 修改 `__venv` 函式裡的 `VENV_DIR_NAMES`。

## 限制

- 只支援標準的 Python venv（`python -m venv`、`virtualenv`），因為判斷方式是找 `bin/activate.fish`
- conda 環境不支援，conda 的 activate 機制不同
- 不支援 pyenv-virtualenv，那個也有自己的 activate 方式

## 手動 vs auto-venv

| 情境 | 手動 | auto-venv |
|---|---|---|
| cd 進專案 | 還要 source activate.fish | 自動啟用 |
| 在子目錄切換 | venv 還在（不會 deactivate） | venv 還在 |
| cd 離開專案 | 要記得 deactivate | 自動關閉 |
| 用 z/zoxide 跳 | venv 不啟動 | 自動啟用 |
| 切換到另一個專案 | 要先 deactivate 再 activate | 自動換 |

## 小結

`auto-venv` 的邏輯簡單，整個 plugin 不到 40 行。監聽 `$PWD` 而不是覆寫 `cd` 這個設計讓它跟所有跳轉工具相容，用 git root 當判斷基準讓在子目錄移動不會意外關掉 venv。裝完幾乎感覺不到它存在，因為它完全在背後自動處理。
