---
title: 'Mole：一個指令清掉 macOS 95GB 的垃圾'
date: '2026-03-09T09:00:00+08:00'
slug: mole-macos-cleaner
image: cover.jpg
description: 'Mole 是 38K stars 的 macOS 清理工具，mo clean 深度清除快取、mo uninstall 連殘留一起刪、mo purge 清 node_modules，乾淨又安全，支援 dry-run 先預覽。'
categories:
  - Tools
tags:
  - macos
  - mole
  - developer-tools
  - productivity
---

磁碟空間快滿，打開 Storage 一看，「其他」佔了 80GB。
CleanMyMac 要錢，Finder 手動刪又找不到那些藏在深處的快取。
[Mole](https://github.com/tw93/Mole) 用一個指令，清掉 95GB。

## Mole 是什麼

Mole 是台灣開發者 [tw93](https://github.com/tw93) 做的 macOS 系統清理工具，用 Shell + Go 寫成，38K stars。把 CleanMyMac 那些功能都做成 CLI 指令，免費、開源、不需要系統權限擴充。

主要功能有六個：`clean`（清垃圾）、`uninstall`（卸載 App）、`optimize`（系統優化）、`analyze`（磁碟分析）、`status`（系統狀態）、`purge`（清開發 artifacts）。

## 安裝

```bash
# Homebrew
brew install tw93/tap/mole

# 或直接用安裝腳本
curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash
```

裝好後確認：

```bash
mo --version
```

所有子指令都用 `mo` 呼叫（不是 `mole`）。

## mo clean：深度清除系統垃圾

```bash
mo clean
```

清的範圍包括：系統快取、log 檔、暫存檔、瀏覽器快取（Chrome、Safari、Firefox）、Xcode derived data、iOS 模擬器快取、各種 App 的快取目錄。

不確定會刪什麼，先跑 dry-run：

```bash
mo clean --dry-run
```

列出所有會被刪的路徑和大小，確認沒問題再正式執行。

有些檔案你不想讓它動，加白名單：

```bash
mo clean --whitelist
```

進入互動介面，勾選要保留的項目。

## mo uninstall：連殘留一起刪

一般把 App 拖進垃圾桶，Library 裡的設定檔、Launch Agent、Preferences 全部留著。Mole 的 uninstall 幫你一次清乾淨：

```bash
mo uninstall
```

會顯示已安裝的 App 清單，選要移除的，確認後把主程式和所有殘留一起刪掉。適合那些用過一次就不需要的試用軟體。

## mo purge：清開發專案的 artifacts

這個對開發者最實用。`node_modules`、Rust 的 `target/`、Go 的 build 快取，這些累積起來很快就幾十 GB：

```bash
mo purge
```

預設掃你的 home 目錄下的專案，列出所有可以清的 artifacts，勾選要刪的確認就好。

指定掃特定目錄：

```bash
mo purge --paths ~/Sites,~/Projects
```

同樣支援 dry-run：

```bash
mo purge --dry-run
```

## mo analyze：找出磁碟空間殺手

```bash
mo analyze
```

互動式磁碟瀏覽器，用百分比 bar 顯示每個目錄佔的空間，可以一層一層往下鑽，找出那些藏在深處吃掉大量空間的目錄。

分析外接硬碟：

```bash
mo analyze /Volumes
```

## mo optimize：系統優化

```bash
mo optimize
```

做幾件事：重建 Spotlight index、清 DNS 快取、重建 Launch Services 資料庫、清 Font 快取。系統跑了一段時間感覺變慢，跑一次通常有感。

同樣支援白名單，避免動到不想碰的服務：

```bash
mo optimize --whitelist
```

## mo status：即時系統狀態

```bash
mo status
```

terminal 裡的即時 dashboard，顯示 CPU 使用率、記憶體、磁碟、網路流量、電池狀態，用 ASCII 圖表呈現。不用開 Activity Monitor 就能快速看系統現況。

## Raycast / Alfred 整合

如果用 Raycast 或 Alfred，可以直接從 launcher 呼叫：

```bash
# 設定 Raycast 使用的 terminal（預設自動偵測）
MO_LAUNCHER_APP=iTerm mo clean
```

或在 shell 設定加入環境變數：

```bash
# ~/.zshrc
export MO_LAUNCHER_APP=iTerm
```

## 跟 CleanMyMac 比

CleanMyMac 要年費，GUI 很漂亮但有些操作要點很多步。Mole 全是 CLI，搭配 dry-run 確認後執行，對習慣 terminal 的開發者更直覺。

功能上 Mole 沒有 CleanMyMac 的惡意軟體掃描和隱私保護，但日常清垃圾、卸載 App、清開發 artifacts 完全夠用。

開發者用 Mole，一般使用者用 CleanMyMac，大概是這樣的定位。

## 參考資源

- [Mole GitHub 儲存庫](https://github.com/tw93/Mole) — 原始碼、issue tracker 與安裝說明
- [Homebrew tap：tw93/tap](https://github.com/tw93/homebrew-tap) — Homebrew 安裝來源
- [Mole 官方 README](https://github.com/tw93/Mole#readme) — 完整指令文件與設定說明
