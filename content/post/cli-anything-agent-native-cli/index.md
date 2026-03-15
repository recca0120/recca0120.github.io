---
title: "CLI-Anything：讓 AI Agent 操作任何軟體的通用橋樑"
description: '不用截圖、不用點擊——用一行指令讓 Claude Code 為任何軟體生成完整 CLI，AI Agent 從此直接呼叫 GIMP、Blender、LibreOffice'
slug: cli-anything-agent-native-cli
date: '2026-03-15T10:00:00+08:00'
image: cover.jpg
categories:
- AI
tags:
- claude-code
- ai-agent
- cli
- automation
draft: false
---

AI Agent 操作軟體，最常見的方式是截圖、OCR、然後模擬滑鼠點擊。我第一次看到這套流程時就覺得不對勁：這不是在用 AI，這是在用 AI 模仿一個視力不好的人。

截圖會失真、解析度有限、UI 版本一更新就全壞。更根本的問題是：GUI 從來就不是設計給程式呼叫的。

[CLI-Anything](https://github.com/HKUDS/CLI-Anything) 換了一個角度：不要讓 AI 學會操作 GUI，而是讓 AI 自動幫軟體生成一套完整的 CLI。Agent 呼叫 CLI，CLI 驅動後端。這個思路讓我覺得方向對了。

## GUI 自動化的根本問題

現在主流的 AI Agent 操作桌面軟體有三條路：

**截圖 + 點擊**（Computer Use）：把畫面截下來，讓 vision model 判斷要點哪裡。Anthropic 自己的 Computer Use demo 就是這樣。問題是：Blender 的按鈕換個主題就認不得，LibreOffice 在 Linux/macOS 的 UI 不一樣，Docker 版本升級後面板位置移了，整個流程就跑不了。

**有限的 API**：有些軟體有 REST API 或 SDK，但覆蓋面極其有限。GIMP 有 Script-Fu，Blender 有 `bpy`，但這些都是原生的 scripting 介面，不是設計給 Agent 呼叫的——沒有標準 I/O、沒有 JSON output、也沒有自我描述能力。

**MCP 包裝**：現在很多人把工具包成 MCP server，但寫一個好的 MCP 需要大量手工設計。每個軟體都要寫一遍，沒有辦法規模化。

CLI-Anything 的前提是：CLI 是人和 AI 都能用的通用介面。

## 為什麼 CLI 是正確答案

CLI 有四個性質，讓它特別適合 Agent 呼叫：

**結構化**：`command subcommand --flag value` 這個語法是確定性的。不像 GUI，同一個指令在不同環境執行結果一致。

**可組合**：CLI 的輸出可以 pipe 給下一個指令。`cli-anything-gimp export --format png | cli-anything-blender import` 這種串接是 GUI 做不到的。

**自我描述**：`--help` 就是說明書。Agent 不需要先讀文件，直接跑 `--help` 就能知道有哪些指令、哪些參數、什麼格式。CLI-Anything 生成的 CLI 全部支援 `--help`。

**確定性**：`cli-anything-libreoffice export --format pdf` 每次都做同一件事。不像截圖，不受螢幕解析度、主題、DPI 影響。

## CLI-Anything 怎麼做：7 步驟 Pipeline

CLI-Anything 的核心是一個全自動的 pipeline，輸入是軟體原始碼，輸出是一套完整的 Python Click CLI。整個流程分七步：

**第 1 步：Analyze**。掃描原始碼，找出所有對應到 GUI 動作的 API 呼叫。比如 GIMP 的「Export As PNG」背後是 `gimp-file-overwrite-png`，Blender 的「Add Mesh」是 `bpy.ops.mesh.primitive_cube_add()`。這一步的輸出是一份 API mapping 文件。

**第 2 步：Design**。根據 API mapping，設計 CLI 的 command groups、state model 和 output format。這步決定 CLI 的整體結構，類似 `git remote`、`git commit` 這種分層設計。

**第 3 步：Implement**。用 [Click](https://click.palletsprojects.com/) 建置實際的 CLI，包含 REPL 模式、`--json` output、undo/redo 支援。每個指令都接上第 1 步找到的真實後端 API，不是 stub。

**第 4 步：Plan Tests**。自動生成 `TEST.md`，列出 unit test 和 E2E test 計畫。

**第 5 步：Write Tests**。實作完整測試。CLI-Anything 目前有 1,508 個 test，全部通過。

**第 6 步：Document**。更新 `TEST.md`，補齊使用說明。

**第 7 步：Publish**。建立 `setup.py`，`pip install -e .` 裝到系統 PATH。裝完之後，Agent 用 `which cli-anything-blender` 就能發現這個工具。

整個 pipeline 不需要人介入，Claude Code 跑完就是一套可用的 CLI。

## Claude Code 快速上手

在 Claude Code 裡用三個指令就能開始：

```bash
# 安裝 CLI-Anything plugin
/plugin marketplace add HKUDS/CLI-Anything

# 安裝 CLI-Anything 本身
/plugin install cli-anything

# 對目標軟體跑 pipeline（以 GIMP 為例）
/cli-anything ./gimp
```

如果生成的 CLI 還沒覆蓋你需要的功能：

```bash
/cli-anything:refine ./gimp "batch processing and filters"
```

`refine` 會針對指定的功能範圍重跑 pipeline，補充缺少的指令。

## 生成出來的 CLI 長什麼樣

以 LibreOffice 為例，生成完的 CLI 用起來像這樣：

```bash
# 建立新文件
cli-anything-libreoffice document new -o report.json --type writer

# 加標題
cli-anything-libreoffice --project report.json writer add-heading \
  -t "Q1 Report" --level 1

# 匯出 PDF
cli-anything-libreoffice --project report.json export render output.pdf -p pdf

# JSON 輸出（給 Agent 用）
cli-anything-libreoffice --json document info --project report.json
```

後端是真實的 LibreOffice headless，不是假的 toy implementation。`--project` 管理狀態，`--json` 讓 Agent 能解析輸出。

Blender 有 REPL 模式，適合互動式的工作流：

```
$ cli-anything-blender
blender> scene new --name ProductShot
blender[ProductShot]> object add-mesh --type cube --location 0 0 1
blender[ProductShot]*> render execute --output render.png --engine CYCLES
```

Prompt 裡的 `*` 表示有未存的變更，跟 git 的狀態顯示邏輯類似。這個設計細節讓我覺得作者真的想過 UX。

## 三個關鍵設計

**JSON mode**：所有指令都支援 `--json` flag，輸出是 machine-readable 的 JSON。這讓其他 Agent 能直接解析結果，不需要 regex 去剝 human-readable output。這是 agent-native 設計的標配，但很多工具沒做到。

**REPL mode**：`cli-anything-blender` 不帶任何參數就進入 REPL，可以維持跨指令的 session 狀態。適合需要多步操作的場景，比如建模、渲染、匯出這三步。

**真實後端**：LibreOffice 用 headless 模式、Blender 用 `bpy`、Audacity 用 `sox`。生成的 CLI 不是 wrapper 假裝成功，而是真的呼叫軟體做事。這讓測試有意義：1,508 個 test 通過，代表功能真的可用。

目前已支援 GIMP（107 tests）、Blender（208）、Inkscape（202）、Audacity（161）、LibreOffice（158）、OBS Studio（153）、Kdenlive（155）、Shotcut（154）、Draw.io（138）、AnyGen（50）、Zoom（22）。

## 我的觀察和限制

跑起來之後的效果確實不錯，但有幾個限制要說清楚。

**需要 frontier-class model**。README 明確標注需要 Claude Sonnet 4.6 以上的等級。生成 1,000+ 行的 Click CLI 再跑完整測試，這個任務的推理複雜度確實不低。拿小 model 跑，大概率生成出來的 CLI 覆蓋率很差。

**需要原始碼**。Pipeline 的第 1 步要掃描原始碼找 API。如果只有 binary，效果會差很多。這讓 CLI-Anything 比較適合開源軟體，閉源商業軟體就麻煩了。

**複雜軟體可能需要多次 refine**。Blender 有幾百個 operator，一次 `/cli-anything` 不太可能全部覆蓋。需要針對具體使用場景跑 `/cli-anything:refine` 補充。

這三個限制都不是設計缺陷，是這個方法在當前技術條件下的合理邊界。

## Software as Agent Tool

CLI-Anything 背後有一個更大的觀念：現有的軟體生態，絕大多數都沒有 agent-native 介面。GIMP 是給人用的，Blender 是給人用的，LibreOffice 也是。要讓 AI Agent 能用這些工具，有兩條路——等軟體作者一個個加 API，或者自動生成一個橋接層。

CLI-Anything 選第二條路，而且用 CLI 而不是 MCP 或 REST API，原因我前面說了：CLI 有 `--help`、有 pipe、有確定性。

這個方向如果成立，AI Agent 的可用工具數量會有量級的增長。不是等軟體廠商支援，而是自己生成支援。

對我來說，更有趣的問題是：如果每個軟體都有 agent-native CLI，接下來 Agent 要怎麼「發現」和「組合」這些工具？CLI-Anything 的 `pip install -e .` + `which` 方案解決了發現問題，但工具組合的語意還需要更多機制。這可能是下一個值得關注的方向。

## 參考資源

- [CLI-Anything GitHub Repository](https://github.com/HKUDS/CLI-Anything)
- [Click — Python CLI Framework](https://click.palletsprojects.com/)
- [Anthropic Computer Use Demo](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo)
- [Claude Code Plugin Marketplace](https://docs.anthropic.com/claude-code/plugins)
