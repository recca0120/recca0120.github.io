# Frontmatter 參考

## 目錄結構

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

## 檔名規則

- 全小寫、kebab-case、英文為主、簡短但能辨識內容

好：`laravel-eloquent-memory-leak`、`redis-connection-refused`
壞：`Laravel-Eloquent-Memory-Leak`、`在-Laravel-如何手動丟出-Validation-Exception`

## Frontmatter 格式

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
- `date` 一定要帶時區 `+08:00`，且不能是未來時間。**寫文章前先用 `date` 指令確認當前時間**
- `image` 封面圖檔名，通常是 `featured.png`
- `categories` 只放一個，`tags` 是陣列格式
- 不要加 `author`、`comments`、`keywords`、`description`（空值）、`abbrlink`

## Title 寫法

40-60 字元，主要關鍵字放前面，具體 > 抽象。

有效公式：

| 公式 | 範例 |
|------|------|
| How I [結果] by [方法] | `How I Cut Docker Build Time by 80% with Layer Caching` |
| [數字] 個 [形容詞] [名詞] | `7 個被低估的 Laravel Eloquent 技巧` |
| [技術A] vs [技術B]: [結論] | `Redis vs Memcached：Session 儲存該選哪個？` |
| Why [常見認知] Is Wrong | `為什麼你的 Microservices 反而讓系統變慢` |
| [問題] 的 [數字] 種解法 | `PHP Memory Leak 的 5 種排查方式` |
| 用 [工具] 解決 [問題] | `用 PHPUnit Data Provider 減少 60% 重複測試程式碼` |

避免：太籠統、超過 60 字元、沒有具體資訊

## Description 寫法

必填，150-160 字元（中文約 50-55 字），包含主要關鍵字，用主動語態。

寫法公式：`[解決什麼問題] + [用什麼方法] + [適用對象或場景]`

好：
- `解決 Redis 6.0 升級後 Connection Refused 的問題，說明 protected-mode 和 bind 設定的變更。`
- `介紹 Laravel Container 的 binding 機制，從基本用法到自訂 Service Provider 的實作方式。`

壞：
- `這篇文章介紹 Redis`（太短）
- `希望這篇文章能幫助你解決 Redis 的問題`（廢話）

## Slug 寫法

英文 kebab-case，全小寫，包含 1-2 個核心關鍵字，3-5 個單字。不要放日期、stop words。

好：`redis-connection-refused`、`laravel-container-facade`
壞：`how-to-fix-the-redis-connection-refused-error-in-ubuntu`

## 分類與標籤

`categories` 從以下固定清單選（大部分 1-2 個）：

| 分類 | 適用範圍 |
|------|----------|
| Laravel | Laravel 框架核心功能 |
| PHP | 非 Laravel 的 PHP 相關 |
| Testing | 測試相關（PHPUnit、Mockery） |
| Database | 資料庫操作（Redis、MySQL、SQLite） |
| Frontend | 前端技術（Alpine.js、JavaScript、CSS） |
| DevOps | 部署、容器、CI/CD |
| Windows | Windows 系統相關 |
| macOS | macOS 系統相關 |

`tags` 用英文，保留官方大小寫（`PHPUnit` 不是 `phpunit`），一篇 2-5 個，只標實際用到的技術。

常用 tags：
- Laravel 生態：`Laravel`、`Eloquent`、`Blade`、`Validation`、`Migration`、`Queue`、`Vite`
- PHP 生態：`PHP`、`Composer`、`PSR-7`
- 測試工具：`PHPUnit`、`Mockery`、`Testing`
- 資料庫：`Redis`、`MySQL`、`SQLite`
- 前端：`Alpine.js`、`JavaScript`
- 工具/服務：`Docker`、`WSL2`、`AWS`、`VS Code`、`Guzzle`、`Flysystem`
- 系統：`Windows`、`VMware`、`Android`、`Linux`
- 硬體：`Raspberry Pi`、`Bluetooth`
