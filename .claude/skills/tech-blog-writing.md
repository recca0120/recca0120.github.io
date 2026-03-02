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

## 高參與度寫作原則

根據 Backlinko 分析 9.12 億篇文章的數據：

### 標題

- 帶數字的標題點擊率高 36%，加方括號（`[實測]`、`[2026]`）再高 38%
- 40-60 字元最佳，關鍵字放前面
- 有效公式：
  - `How I [結果] by [方法]`（第一人稱 + 可量化成果）
  - `[數字] + [形容詞] + [名詞]`（如「7 個被低估的 Go 模式」）
  - `Why [常見認知] Is Wrong`（反直覺引發好奇）
  - `[技術A] vs [技術B]: [結論]`（比較型，高搜尋意圖）

### 文章長度

- 一般技術文：1,500-2,000 字
- 要搶排名的關鍵字：2,000-2,500 字（Google 前 10 名平均 1,447 英文字）
- 完整指南 / 支柱頁面：3,000+ 字（反向連結多 3.5 倍）

### 可讀性

- 句子平均 15-20 字，長短交錯
- 段落 1-3 句（手機閱讀友善）
- 每 200-300 字一個 H2/H3 小標題
- 每 350-500 字至少一張圖、圖表或程式碼區塊
- 程式碼必須可複製貼上且能跑，壞的範例會永久失去信任

### 開頭（前 3 句定生死）

讀者看前 3 句決定要不要繼續。有效的 hook：
- **痛點辨識**：第一句講讀者的問題，讓他自我代入
- **數據衝擊**：用違反直覺的數字開場
- **結果預告**：明確告訴讀者看完能得到什麼
- **場景故事**：「上週二凌晨三點，production 的資料庫掛了…」

禁止：「In today's digital landscape…」「最近在工作中遇到了一個有趣的問題」這類空泛開場。

### SEO 結構

- H1 包含主要關鍵字（一頁一個）
- 前 100 字內出現主要關鍵字
- H2 用語義相關詞（不是重複關鍵字）
- `description` 150-160 字元，包含關鍵字和價值主張
- URL slug 短、用連字號、含關鍵字

### 內部連結

- 相關文章之間互相連結，用描述性錨點文字（不是「點這裡」）
- 同主題的文章形成 cluster，指向一篇支柱文章
- 主題群集比獨立文章多 30% 流量，排名持久 2.5 倍

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
- 加入「什麼沒用 / 踩過什麼坑」的段落，增加可信度和資訊增益

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
├── index.md        # 中文文章（預設語言）
├── index.en.md     # 英文翻譯
└── featured.png    # 封面圖（共用）
```

多語系規則：
- 中文是預設語言（`zh-hant-tw`），檔名用 `index.md`
- 英文版檔名用 `index.en.md`
- 兩個版本的 `slug` 必須相同
- 英文版的 `title` 和 `description` 翻譯成英文，其餘 frontmatter 不變
- 封面圖 `featured.png` 共用，不需要複製

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
description: '一句話摘要，160 字元以內，用於 meta description 和 SEO'
slug: url-slug-kebab-case
date: 'YYYY-MM-DDTHH:MM:SS+08:00'
image: featured.png
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
- `date` 一定要帶時區 `+08:00`，且不能是未來時間（Hugo 預設不建置未來文章）
- `image` 封面圖檔名，通常是 `featured.png`
- `categories` 只放一個，`tags` 是陣列格式
- 不要加 `author`、`comments`、`keywords`、`description`（空值）、`abbrlink`

### Title 寫法

`title` 是搜尋結果和社群分享的第一印象，直接影響點擊率。

規則：
- 40-60 字元（過長會被 Google 截斷）
- 主要關鍵字放前面
- 具體 > 抽象，有結果 > 沒結果

有效公式：

| 公式 | 範例 |
|------|------|
| How I [結果] by [方法] | `How I Cut Docker Build Time by 80% with Layer Caching` |
| [數字] 個 [形容詞] [名詞] | `7 個被低估的 Laravel Eloquent 技巧` |
| [技術A] vs [技術B]: [結論] | `Redis vs Memcached：Session 儲存該選哪個？` |
| Why [常見認知] Is Wrong | `為什麼你的 Microservices 反而讓系統變慢` |
| [問題] 的 [數字] 種解法 | `PHP Memory Leak 的 5 種排查方式` |
| 用 [工具] 解決 [問題] | `用 PHPUnit Data Provider 減少 60% 重複測試程式碼` |

避免：
- 太籠統：「Laravel 學習筆記」「PHP 小技巧」
- 太長：超過 60 字元的標題在搜尋結果會被截斷
- 沒有具體資訊：「關於 Docker 的一些事」

### Description 寫法

`description` 顯示在 Google 搜尋結果摘要、社群分享預覽、JSON-LD structured data。

規則：
- 必填，150-160 字元（中文約 50-55 字）
- 包含主要關鍵字
- 用主動語態描述文章能解決什麼問題或教什麼
- 不要只是標題的重複

寫法公式：`[解決什麼問題] + [用什麼方法] + [適用對象或場景]`

好的範例：
- `解決 Redis 6.0 升級後 Connection Refused 的問題，說明 protected-mode 和 bind 設定的變更。`
- `介紹 Laravel Container 的 binding 機制，從基本用法到自訂 Service Provider 的實作方式。`
- `用 Docker Compose 搭配 VS Code PHPUnit 擴充套件，在容器內跑測試並支援 Xdebug 除錯。`

壞的範例：
- `這篇文章介紹 Redis`（太短、沒有具體資訊）
- `Redis Connection Refused 解決方案`（只是標題的縮寫）
- `希望這篇文章能幫助你解決 Redis 的問題`（廢話）

### Slug 寫法

`slug` 決定 URL 路徑，影響 SEO 和可讀性。

規則：
- 英文 kebab-case，全小寫
- 包含 1-2 個核心關鍵字
- 3-5 個單字，越短越好
- 不要放日期（permalink 已有日期）
- 不要放 stop words（the、a、and、of）

好：`redis-connection-refused`、`laravel-container-facade`、`vscode-phpunit`
壞：`how-to-fix-the-redis-connection-refused-error-in-ubuntu`

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

### Prompt 撰寫原則

封面圖 prompt 的目標是產出「一眼能感受到文章主題」的意象圖，不是插圖或教學圖。

結構公式：`[主體場景] + [視覺風格] + [氛圍/色調] + [負面提示]`

撰寫規則：
- 用英文描述
- 第一句描述主體場景：把文章核心概念轉化成具體的視覺意象
  - 好：`A glowing container ship made of code blocks sailing through a digital ocean`
  - 壞：`Docker containers`（太抽象，產不出有意義的圖）
- 第二句加風格和氛圍：`cinematic lighting, 4k wallpaper style, deep blue and cyan color palette`
- 常用風格詞：`cinematic lighting`、`4k wallpaper style`、`isometric view`、`flat design`、`neon glow`、`minimal`、`dark moody atmosphere`
- 色調建議：
  - DevOps / Docker：藍、青
  - Laravel / PHP：紅、橘
  - Testing：綠
  - Database：紫、深藍
  - Frontend：黃、亮色系
- 不要放文字（AI 產的文字一定是亂碼）
- 不要放人臉（容易崩壞）
- 兩到三句話，具體比抽象好

範例：
- Redis 文章：`A network of glowing red crystal nodes connected by light beams in a dark server room, cinematic lighting, 4k wallpaper style, warm red and amber tones`
- Docker 文章：`Stacked translucent shipping containers floating in a digital void, each containing miniature server racks, isometric view, neon blue and cyan, dark background`
- Laravel 文章：`An elegant red phoenix rising from lines of code, cinematic lighting, 4k wallpaper style, deep red and orange gradients against dark background`

## 寫作流程

1. 建立目錄 `content/post/{slug}/`
2. 確認主題和目標讀者
3. 想一個帶數字或具體成果的標題
4. 寫 3 句 hook 開場（痛點、數據或場景）
5. 列出起承轉合的大綱
6. 寫初稿到 `index.md`（目標 1,500-2,500 字）
7. 套用 Humanizer-zh 規則檢查 AI 痕跡
8. 確認程式碼可讀、有註解、可複製貼上
9. 加入相關文章的內部連結
10. 確認 frontmatter 格式正確（description、date 時區、tags 大小寫）
11. 用 Cloudflare Workers AI 產封面圖
12. `hugo server` 本地預覽確認排版正常
13. 寫英文版 `index.en.md`
14. commit 並 push 到 `main`，GitHub Actions 會自動部署

## 部署驗證

```bash
# 本地預覽
hugo server -D

# 正式建置
hugo --gc --minify

# 確認文章數量
find content/post -name "index.md" | wc -l
```
