---
name: hugo-theme-stack
description: |
  Use when configuring Hugo Stack theme settings: sidebar, widgets, comments (Giscus),
  color scheme, article options, custom CSS, or Stack-specific shortcodes.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Hugo Stack Theme 參考

GitHub: CaiJimmy/hugo-theme-stack

## params.toml 完整參考

```toml
mainSections = ["post"]
featuredImageField = "image"    # front matter 裡的封面圖欄位名
rssFullContent = true
favicon = "/favicon.ico"

[footer]
  since = 2020
  customText = ""

[dateFormat]
  published = ":date_full"
  lastUpdated = ":date_full"
```

## Sidebar

```toml
[sidebar]
  compact = false
  avatar = "img/avatar.png"   # 相對於 assets/ 或 static/
  emoji = "💻"                # 浮在 avatar 上的 emoji
  subtitle = "副標題"
```

sidebar 會自動顯示：avatar、emoji、subtitle、main menu、social links、語言切換器、dark mode toggle。

## Article 設定

```toml
[article]
  headingAnchor = true
  math = false           # KaTeX，可在 front matter 用 math: true 覆寫
  toc = true             # 可在 front matter 用 toc: false 覆寫
  readingTime = true

  [article.list]
    showTags = false     # 列表頁是否顯示 tags

  [article.license]
    enabled = true
    default = "Licensed under CC BY-SA 4.0"  # 支援 Markdown

  [article.mermaid]
    look = "classic"     # classic | handDrawn
    lightTheme = "default"
    darkTheme = "dark"
```

Per-page 覆寫：`math`、`toc`、`readingTime`、`license`、`comments`

## Widgets

```toml
[widgets]
  homepage = [
    { type = "search" },
    { type = "archives", params = { limit = 5 } },
    { type = "categories", params = { limit = 10 } },
    { type = "tag-cloud", params = { limit = 20 } },
  ]
  page = [{ type = "toc" }]
```

可用 widget：`search`、`archives`、`categories`、`tag-cloud`、`toc`（僅 page）。

search 需要建立 `content/search/index.md`：
```yaml
---
title: Search
layout: search
outputs: [html, json]
---
```

archives 需要 `content/archives/index.md`：
```yaml
---
title: Archives
layout: archives
---
```

## Color Scheme

```toml
[colorScheme]
  toggle = true       # 顯示切換按鈕
  default = "auto"    # auto | light | dark
```

儲存在 `localStorage` key `StackColorScheme`。

## Comments

```toml
[comments]
  enabled = true
  provider = "giscus"   # 支援：disqus, utterances, giscus, waline, twikoo 等 13 種

  [comments.giscus]
    repo = "owner/repo"
    repoID = ""              # 注意大小寫：repoID 不是 repoId
    category = "General"
    categoryID = ""          # 注意大小寫：categoryID 不是 categoryId
    mapping = "pathname"     # pathname | url | title | og:title
    lightTheme = "light"     # 要分開設，不能用 theme
    darkTheme = "dark_dimmed"
    reactionsEnabled = 1     # 整數，不是 boolean
    emitMetadata = 0         # 整數，不是 boolean
    inputPosition = "top"    # top | bottom
    lang = "zh-TW"
    strict = 0
    loading = "lazy"
```

Giscus 需要安裝 GitHub App：https://github.com/apps/giscus

## OpenGraph / SEO

```toml
[opengraph]
  [opengraph.twitter]
    site = ""                    # Twitter handle
    card = "summary_large_image"
```

Stack 自動產生 `og:title`、`og:description`、`og:image`、`og:url` 等 meta tag。

## Image Processing

```toml
[imageProcessing.cover]
  enabled = true
[imageProcessing.content]
  enabled = true
```

## Menu 設定

`config/_default/menu.toml`（每種語言可有自己的 `menu.xx.toml`）：

```toml
[[main]]
  identifier = "home"
  name = "Home"
  url = "/"
  weight = 10
  [main.params]
    icon = "home"       # Tabler Icons 名稱
    newTab = false

[[social]]
  identifier = "github"
  name = "GitHub"
  url = "https://github.com/username"
  [social.params]
    icon = "brand-github"
```

Stack 的 icon 用 Tabler Icons：`home`、`archives`、`categories`、`tag`、`search`、`brand-github`、`brand-twitter`、`rss`

## 自訂 CSS

在 `assets/scss/custom.scss`（不是 theme 裡面）：

```scss
:root {
  --accent-color: #34495e;
  --card-border-radius: 10px;
  --article-font-size: 1.6rem;
  --article-line-height: 1.85;
}

[data-scheme="dark"] {
  --body-background: #303030;
  --card-background: #424242;
}
```

主要 CSS 變數：`--body-background`、`--accent-color`、`--accent-color-darker`、`--accent-color-text`、`--body-text-color`、`--card-background`、`--card-border-radius`、`--shadow-l1` ~ `--shadow-l4`

## 自訂 Partials

- `layouts/_partials/head/custom.html` — 注入 `<head>`
- `layouts/_partials/footer/custom.html` — 注入 `</body>` 前
- `layouts/_partials/head/custom-font.html` — 自訂字型

## Shortcodes

```
{{< bilibili BV1234567890 >}}
{{< youtube dQw4w9WgXcQ >}}
{{< video src="/videos/demo.mp4" >}}
{{< quote author="Author" source="Book" url="https://..." >}}引文{{< /quote >}}
```

## Render Hooks

Stack 內建覆寫：
- 圖片：lazy loading + PhotoSwipe lightbox
- 連結：外部連結自動 `target="_blank"`
- 標題：`headingAnchor = true` 時加錨點
- Blockquote：支援 GitHub alert（`> [!NOTE]`、`> [!TIP]`、`> [!WARNING]`）
- Code block：` ```mermaid ` 自動渲染

## 多語系

`defaultContentLanguage` 必須跟 theme 的 `i18n/` 檔名一致。

Stack 內建翻譯：ar, be, bg, bn, ca, cs, de, el, en, es, fa, fr, hi, hu, id, it, ja, ko, nl, oc, pl, pt-br, pt-pt, ru, sk, th, tr, uk, vi, zh, **zh-hant-tw**

語言切換器在 sidebar 自動出現（當 `hugo.IsMultilingual = true`）。

## 常見地雷

- Giscus 設定 key 大小寫敏感：`repoID` / `categoryID`，不是 `repoId` / `categoryId`
- Giscus `reactionsEnabled` / `emitMetadata` 要用整數 `1` / `0`，不能用 `true` / `false`
- Giscus theme 要用 `lightTheme` + `darkTheme` 分開設，不能用單一 `theme`
- `defaultContentLanguage = "zh-tw"` 會找不到 i18n，要用 `"zh-hant-tw"`
- `[opengraph.twitter]` 不能寫成 `twitter = {}`（TOML 不接受 inline empty table）
