---
name: tech-blog-writing
description: >-
  Guides writing and editing technical blog posts for recca0120.github.io. Covers article structure,
  SEO, frontmatter conventions, cover image generation, and humanized writing style.
  Use when creating new posts or rewriting existing articles on this Hugo blog.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# 技術部落格文章撰寫規範

## 專案資訊

- Hugo + Stack 主題
- 設定檔：`config/_default/` 下多個 `.toml`
- 文章放在：`content/post/{slug}/index.md`
- 部署：push 到 `main` 分支自動透過 GitHub Actions 部署到 GitHub Pages
- 網址：https://recca0120.github.io/

## 寫作流程

1. 建立目錄 `content/post/{slug}/`
2. 確認主題和目標讀者
3. 想一個帶數字或具體成果的標題
4. 寫 3 句 hook 開場（痛點、數據或場景）
5. 列出起承轉合的大綱
6. 寫繁體中文初稿 `index.md`（目標 1,500-2,500 字）
7. 套用 humanizer-zh 規則檢查 AI 痕跡
8. 確認程式碼可讀、有註解、可複製貼上
9. 加入相關文章的內部連結
10. 確認 frontmatter 格式正確（見 `frontmatter-reference.md`）
11. 寫英文版 `index.en.md`（完整翻譯，不是摘要）
12. 用 Cloudflare Workers AI 產封面圖（見 `cover-image.md`）
13. `hugo --gc --minify` 確認建置無錯誤
14. commit 並 push 到 `main`

## 文章結構：起承轉合

每篇文章必須有明確的敘事線。

- **起（問題或情境）**：直接描述狀況或目標，貼出錯誤訊息或觸發條件
- **承（原因分析）**：用一兩句話說明技術原因，貼關鍵原始碼片段
- **轉（解決方案）**：具體可操作的步驟，程式碼有語言標記和中文註解
- **合（補充）**：注意事項或替代方案。有就寫，沒有就不寫

## 關鍵原則

### 語氣（詳見 `writing-style.md`）

- 用「我」描述自己的經驗，直接陳述事實
- 句子長短交錯，技術名詞保留英文，中英文之間空一格
- 禁止 AI 填充詞、聊天機器人語氣、三段式列舉

### SEO

- H1 包含主要關鍵字，前 100 字內出現主要關鍵字
- `description` 150-160 字元，包含關鍵字和價值主張
- 相關文章之間互相連結，用描述性錨點文字

### 套件介紹規範

- 首次提到套件名稱時，附上官方連結（GitHub repo、npm、Packagist 等）
- 文章介紹或深度使用的套件，加入 `tags`
- 介紹套件的文章必須包含安裝指令

### Agent 使用規則

- 批次處理文章時，使用 Agent tool 並行處理
- Agent 的 model 參數至少指定 `sonnet`，不要用 `haiku`
- 每個 agent 處理 10-15 篇為一批

## 參考文件

- `frontmatter-reference.md` — Frontmatter 格式、title/description/slug 規則、分類與標籤
- `cover-image.md` — Cloudflare Workers AI 封面圖產生
- `writing-style.md` — 語氣規範、高參與度寫作原則
