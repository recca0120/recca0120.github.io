---
name: hugo
description: |
  Use when modifying Hugo site configuration, creating templates/partials/shortcodes,
  managing content structure, or debugging Hugo build issues.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Hugo 靜態網站產生器參考

## 設定檔結構

```
config/_default/
├── hugo.toml        # 核心設定（baseURL、theme、語言、分頁、permalink）
├── params.toml      # 主題參數
├── menu.toml        # 選單（可依語言拆分：menu.en.toml）
├── languages.toml   # 多語系
└── markup.toml      # Markdown 渲染設定
```

環境覆寫：`config/production/params.toml`

## hugo.toml 常用設定

```toml
baseURL = "https://example.com/"  # 必須有 protocol 和尾斜線
title = "Site Title"
theme = "theme-name"
languageCode = "zh-TW"
defaultContentLanguage = "zh-hant-tw"
hasCJKLanguage = true
timeZone = "Asia/Taipei"
googleAnalytics = "G-XXXXXXXXXX"
enableGitInfo = false  # 需要完整 git history

[pagination]
  pagerSize = 10

[permalinks]
  post = "/:year/:month/:day/:slug/"

[taxonomies]
  tag = "tags"
  category = "categories"

[outputs]
  home = ["HTML", "RSS", "JSON"]  # JSON 給搜尋用
```

Permalink token：`:year` `:month` `:day` `:slug` `:section` `:title` `:contentbasename`

## Content 管理

### Page Bundle（Leaf Bundle）

```
content/post/my-article/
├── index.md          # 預設語言
├── index.en.md       # 英文版
└── featured.png      # Page resource
```

Branch Bundle 用 `_index.md`，Leaf Bundle 用 `index.md`，混用會壞掉。

### Front Matter

```yaml
---
title: "文章標題"
description: "SEO 摘要，160 字元以內"
slug: url-slug
date: "2024-01-15T09:00:00+08:00"
image: featured.png
categories:
  - Category
tags:
  - Tag1
  - Tag2
draft: false
---
```

關鍵欄位：
- `slug` 只覆寫最後一段 URL；`url` 覆寫整個路徑
- `draft: true` 不加 `-D` 不會發布
- `weight` 控制排序（數字小的在前）
- `aliases` 做舊 URL 轉址

## 多語系

### 檔名策略

```
content/post/slug/
├── index.md        # 預設語言
└── index.en.md     # 英文
```

### languages.toml

```toml
[zh-hant-tw]
  languageName = "正體中文"
  weight = 1
[en]
  languageName = "English"
  weight = 2
```

注意：`defaultContentLanguage` 必須跟 `languages.toml` 的 key 完全一致，也要跟 theme 的 `i18n/` 檔名一致。

每個語言可以有自己的 `menu.xx.toml`。

模板裡用 `relLangURL` / `absLangURL`，不要寫死路徑。

## 模板系統

### 查找順序（高到低）

1. 專案 `layouts/` > theme `layouts/`
2. 語言特定 > 通用
3. Type 特定 > `_default/`

### 常用覆寫位置

```
layouts/
├── _partials/head/custom.html    # 注入 <head>（JSON-LD、meta）
├── _partials/footer/custom.html  # 注入 </body> 前
├── _markup/render-image.html     # 自訂圖片渲染
└── _default/single.html          # 覆寫單篇頁面
```

### Go Template 語法速查

```go
{{ .Title }}  {{ .Content }}  {{ .Permalink }}  {{ .RelPermalink }}
{{ .Params.image }}  {{ .Site.Title }}  {{ .Site.BaseURL }}

{{ if .IsPage }}...{{ end }}
{{ with .Description }}{{ . }}{{ end }}
{{ range .Pages }}...{{ end }}

{{ .Date.Format "2006-01-02T15:04:05Z07:00" }}  # Go 的 reference time
{{ .Title | jsonify }}     # JSON 安全輸出
{{ .Summary | plainify | truncate 160 }}
```

`$` 在 `range`/`with` 裡存取最外層 context。

## CLI 常用指令

```bash
hugo server -D              # 本地預覽（含草稿）
hugo --gc --minify          # 正式建置
hugo new content post/slug/index.md
hugo list drafts            # 列出草稿
hugo config                 # 印出合併後設定
hugo env                    # 版本 + 環境資訊
```

## 常見地雷

- `baseURL` 漏尾斜線或 protocol → 路徑全壞
- `index.md` vs `_index.md` 搞混 → page bundle 失效
- `enableGitInfo = true` 在 CI 需要 `fetch-depth: 0`
- SCSS 需要 Hugo Extended 版本
- `resources/` 快取目錄可以 commit 加速 CI
- `.` 在 `range`/`with` 會變 context，用 `$` 存取外層
