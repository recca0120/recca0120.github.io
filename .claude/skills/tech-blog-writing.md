---
name: tech-blog-writing
description: |
  撰寫技術部落格文章的規範。適用於新增或改寫 recca0120.github.io 的文章。
  確保文章有清楚的起承轉合、程式碼有上下文說明、語氣自然不帶 AI 味。
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
metadata:
  trigger: 撰寫或改寫部落格文章
---

# 技術部落格文章撰寫規範

## 專案資訊

- Hugo + Stack 主題
- 設定檔：`config/_default/` 下多個 `.toml`
- 文章放在：`content/post/{slug}/index.md`
- 部署：push 到 `main` 分支自動透過 GitHub Actions 部署到 GitHub Pages
- 網址：https://recca0120.github.io/

## 文章結構：起承轉合

每篇文章必須有明確的敘事線，讓讀者知道前因後果。

### 起：問題或情境

用一兩句話交代背景。讀者要能馬上知道「這篇在講什麼」「我會不會遇到一樣的問題」。

寫法：
- 直接描述遇到的狀況或想達成的目標
- 貼出錯誤訊息或觸發條件
- 不要用「最近在工作中遇到了一個有趣的問題」這種空泛開場

範例：
> 把 Redis 升級到 6.0.5 之後，用 `redis-cli` 連線時冒出了這段錯誤：
> ```
> Could not connect to Redis at 127.0.0.1:6379: Connection refused
> ```

### 承：原因分析

解釋為什麼會發生這個問題。不用很長，但要讓讀者理解根因。

寫法：
- 用一兩句話說明技術原因
- 如果有翻原始碼，貼出關鍵片段並標註重點
- 不需要鋪陳「經過一番研究」「深入探討後發現」

範例：
> Redis 6.0 開始預設綁定了特定的網路介面，加上 `protected-mode` 預設為 `yes`，導致本機連線也會被擋下來。

### 轉：解決方案

這是文章的主體。給出具體可操作的步驟。

寫法：
- 程式碼區塊要有語言標記（php、bash、ini 等）
- 程式碼裡的關鍵行加上中文註解
- 如果有多種做法，用標題分開，說明各自的適用場景
- 先給最簡單的做法，再給進階做法

### 合：補充或注意事項

收尾。可以是注意事項、替代方案、或適用範圍的提醒。不一定需要，短文可以省略。

寫法：
- 不要用「總結來說」「希望這篇文章對你有幫助」
- 不要用樂觀空泛的結尾
- 有就寫，沒有就不寫

## 語氣規範

### 要

- 用「我」來描述自己的經驗
- 直接陳述事實
- 句子長短交錯
- 技術名詞保留英文（Redis、Laravel、PHP）
- 中英文之間空一格
- 口語但不隨便：「查了一下原始碼才搞懂」「結果不是」

### 不要

- 「此外」「值得注意的是」「深入探討」（AI 填充詞）
- 「希望這對你有幫助」「如果你有任何問題」（聊天機器人語氣）
- 三段式列舉（強迫症式的湊三個）
- 每段都用粗體開頭
- 過度使用破折號（——）
- 「不僅……而且……」「這不僅僅是……」

### 參考 Humanizer-zh 規則

改寫文章時同時套用 `.claude/skills/humanizer-zh.md` 的規則，去除 AI 寫作痕跡。

## 檔案格式

### 目錄結構

使用 Hugo Page Bundle 格式：

```
content/post/{slug}/
├── index.md        # 文章內容
└── featured.png    # 封面圖
```

### 檔名規則

- 全小寫
- 用 kebab-case（連字號分隔）
- 英文為主，不用中文檔名
- 簡短但能辨識內容

好：`laravel-eloquent-memory-leak`、`redis-connection-refused`
壞：`Laravel-Eloquent-Memory-Leak`、`在-Laravel-如何手動丟出-Validation-Exception`

### Frontmatter

```yaml
---
title: 文章標題（中英文皆可）
slug: url-slug-kebab-case
date: 'YYYY-MM-DDTHH:MM:SS+08:00'
categories:
- 分類名稱
tags:
- 標籤1
- 標籤2
draft: false
---
```

規則：
- `slug` 用英文 kebab-case
- `date` 一定要帶時區 `+08:00`
- `categories` 只放一個，`tags` 是陣列格式
- 不要加 `author`、`comments`、`keywords`、`description`（空值）、`abbrlink`

### 分類與標籤規則

`categories` 只選一個主分類，從以下固定清單選：

| 分類 | 適用範圍 |
|------|----------|
| Laravel | Laravel 框架核心功能（Eloquent、Blade、Container、Migration、Queue 等） |
| PHP | 非 Laravel 的 PHP 相關（Composer、PSR、原生函數、擴展） |
| Testing | 測試相關（PHPUnit、Mockery、測試技巧，不管是否用 Laravel） |
| Database | 資料庫操作（Redis、MySQL、SQLite，非 Laravel ORM 層面） |
| Frontend | 前端技術（Alpine.js、JavaScript、CSS） |
| DevOps | 部署、容器、CI/CD（Docker、WSL2、GitHub Actions） |
| Windows | Windows 系統相關 |
| macOS | macOS 系統相關 |

`tags` 標記文章涉及的具體技術，使用**正確大小寫**：

- Laravel 生態：`Laravel`、`Eloquent`、`Blade`、`Validation`、`Migration`、`Queue`、`Vite`
- PHP 生態：`PHP`、`Composer`、`PSR-7`
- 測試工具：`PHPUnit`、`Mockery`、`Testing`
- 資料庫：`Redis`、`MySQL`、`SQLite`
- 前端：`Alpine.js`、`JavaScript`
- 工具/服務：`Docker`、`WSL2`、`AWS`、`VS Code`、`Guzzle`、`Flysystem`
- 系統：`Windows`、`VMware`、`Android`、`Linux`
- 硬體：`Raspberry Pi`、`Bluetooth`

原則：
- tag 用英文，保留官方大小寫（`PHPUnit` 不是 `phpunit`）
- 一篇文章通常 1-4 個 tags
- 只標文章**實際用到**的技術，不要為了 SEO 亂標

## 封面圖產生

使用 Cloudflare Workers AI 產生封面圖。API 金鑰在 `~/.zshrc` 的環境變數：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

產圖指令：

```bash
# flux-1-schnell 回傳 JSON（base64），需要解碼
response=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-1-schnell" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "你的英文描述", "width": 1024, "height": 576}' \
  --max-time 60)

echo "$response" | python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
img=base64.b64decode(d['result']['image'])
with open('content/post/{slug}/featured.png','wb') as f: f.write(img)
"
```

Prompt 撰寫原則：
- 用英文描述
- 風格：cinematic lighting、4k wallpaper style、具體的視覺意象
- 描述文章主題的核心概念，加上氛圍描述（色調、光線、構圖）
- 不要放文字、不要放人臉
- 兩到三句話，具體比抽象好

## 寫作流程

1. 建立目錄 `content/post/{slug}/`
2. 確認主題和目標讀者
3. 列出起承轉合的大綱
4. 寫初稿到 `index.md`
5. 套用 Humanizer-zh 規則檢查 AI 痕跡
6. 確認程式碼可讀、有註解
7. 確認 frontmatter 格式正確
8. 用 Cloudflare Workers AI 產封面圖
9. `hugo server` 本地預覽確認排版正常
10. commit 並 push 到 `main`，GitHub Actions 會自動部署

## 部署驗證

```bash
# 本地預覽
hugo server -D

# 正式建置
hugo --gc --minify

# 確認文章數量
find content/post -name "index.md" | wc -l
```
