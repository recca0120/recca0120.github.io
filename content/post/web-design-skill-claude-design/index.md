---
title: '把 AI 生的網頁從「能用」升級到「有設計感」：web-design-skill 導讀'
description: '導讀 ConardLi/web-design-skill：用反陳腔濫調清單、oklch 色彩、預先宣告 design system、v0 草稿等規則，把 AI 生網頁從同質化美學救出來。'
slug: web-design-skill-claude-design
date: '2026-04-25T15:05:00+08:00'
image: featured.png
categories:
- Frontend
tags:
- claude-code
- ai-agent
- Design
- oklch
draft: false
---

讓 Claude Code 或 Cursor 隨手生一張 landing page，你大概可以在三秒內猜中它長什麼樣：Inter 字體、藍色按鈕、紫粉漸層 hero、大圓角卡片、emoji 當 icon，再配幾段假的 testimonial。功能沒問題，就是看一眼就知道「這是 AI 寫的」。

[ConardLi/web-design-skill](https://github.com/ConardLi/web-design-skill) 想處理的就是這件事。它把 Anthropic 在 2026 年 4 月推出的 [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) 系統提示詞濃縮成一份開源、可移植的 SKILL.md，丟進 `.claude/skills/` 或 `.agents/skills/` 就能用，目的是讓 agent 寫前端時帶點設計品味，而不是每次都產出同一張臉的網頁。

這篇是導讀，順便整理我覺得這份 skill 最值得抄的幾個設計哲學。

## 問題：AI 網頁的同質化美學

LLM 寫前端的能力早就過了「能不能跑」的階段，但所有模型訓練資料重疊太多，輸出會收斂到同一種長相。作者整理了一份「AI 一寫前端就會出現」的反清單：

- 紫粉藍漸層背景
- 左邊一條彩色直槓的卡片
- Inter / Roboto / Arial / system-ui 字體
- 拿 emoji 當 icon
- 編造的數據、假 logo 牆、假 testimonial

這些不是錯，是太常見。看到就知道是 AI 寫的，品牌就被稀釋了。

## 解法一：反陳腔濫調清單

skill 裡明確列出黑名單，agent 在生成前會被提醒「這些不要用」。這比「請設計得有品味」這種模糊指令有用太多——LLM 對否定指令的遵從度其實不錯，前提是條目要具體。

> 與其叫 AI「設計得好看」，不如直接告訴它「不要用紫粉漸層、不要用 Inter、不要用 emoji 當 icon」。約束反而讓設計空間打開。

## 解法二：oklch 色彩系統

這是整份 skill 裡最技術性的一段。傳統 HSL 在亮度感知上不一致——同樣 lightness 50% 的黃色看起來比藍色亮很多，所以 AI 用 HSL 衍生色階常常出現「明明數值對稱、看起來卻歪掉」的狀況。

`oklch` 是感知均勻的色彩空間，同樣的 L 值人眼看起來真的一樣亮。skill 強制用 oklch 來定義色彩 tokens：

```css
:root {
  --color-bg: oklch(98% 0.01 80);
  --color-fg: oklch(20% 0.02 80);
  --color-accent: oklch(65% 0.18 30);
}
```

副作用是色階推導變得很乾淨——只要鎖定 chroma 和 hue、調 lightness，就能拿到一組視覺一致的灰階或主色階。

## 解法三：預先宣告 design system

這招我覺得是整份 skill 的精髓。AI 寫前端最大的問題是「邊寫邊決定」：寫到 hero 才挑顏色、寫到 footer 又換一套字體，最後整頁東拼西湊。

skill 強制 agent 在動手寫 code 之前，先用 markdown **明確宣告 design tokens**：

```markdown
## Design System

- **Palette**: warm paper (oklch 97% 0.01 80) / ink (oklch 18% 0.02 80) / accent caramel (oklch 65% 0.15 60)
- **Typography**: Instrument Serif (display) + Space Grotesk (UI) + JetBrains Mono (code)
- **Spacing**: 4px base, 8/16/24/40/64 scale
- **Motion**: 200ms ease-out for micro, 600ms ease-in-out for page transitions
```

宣告完才開始寫 code。這個動作把「設計決策」和「實作」分開，讓使用者可以在 token 層級就糾正方向，不必等整頁寫完才發現整體調性錯了。

## 解法四：v0 草稿先給看

不要一次寫完才交件。skill 規定 agent 先做一版「v0」：layout 骨架 + design tokens + placeholder，先讓使用者確認方向再展開細節。

這個流程跟人類設計師的 wireframe → high-fi mockup 一模一樣。AI 之前不太這樣做是因為它太想一次給完整成品，但完整成品改起來成本很高，半成品反而便宜。

## 解法五：placeholder 哲學

AI 最常做的蠢事之一：缺圖時硬畫一張歪七扭八的 SVG 假裝是插圖。skill 直接禁止，改用誠實的標記：

```html
<div class="placeholder">[hero image: photographer portrait, 3:4]</div>
```

理由很簡單：歪 SVG 會誤導使用者以為那是設計成品，文字 placeholder 反而清楚標示「這裡需要真實素材」。

## 六步驟工作流

skill 把整個流程結構化成六步：

1. **理解需求**——資訊不夠才問
2. **蒐集設計脈絡**——code > 截圖，永遠不從零開始
3. **宣告 design system**——前面講過的，用 markdown 寫 tokens
4. **v0 草稿先給看**——layout + placeholder
5. **完整實作**——components、states、motion，關鍵節點停下來確認
6. **驗證**——交付前 checklist：沒 console error、沒亂入色

這個結構壓抑了 LLM「想一次給完整答案」的衝動，把它逼成 iterative 工作流。

## 六種色彩 × 字型配對

最實用的速查表大概就是這個。skill 列了六組預先驗證過的搭配，agent 沒靈感時直接挑一組：

| 風格 | 主色 | 字體 | 適用 |
|------|------|------|------|
| 現代科技 | 藍紫 | Space Grotesk + Inter | SaaS、開發工具 |
| 雅致編輯 | 暖棕 | Newsreader + Outfit | 內容、部落格 |
| 高端品牌 | 近黑 | Sora + Plus Jakarta Sans | 精品、金融 |
| 活潑消費 | 珊瑚紅 | Plus Jakarta Sans + Outfit | 電商、社群 |
| 簡約專業 | 青藍 | Outfit + Space Grotesk | Dashboard、B2B |
| 工匠暖意 | 焦糖 | Caveat + Newsreader | 餐飲、教育 |

可以注意到 Inter 只出現在「現代科技」配角，不是預設值——這就是反陳腔濫調的具體實踐。

## 怎麼用

clone 下來把 `.agents/skills/web-design-engineer/` 複製到專案裡（Claude Code 用 `.claude/skills/`），agent 在處理前端任務時會自動載入。然後就照常下你的需求，剩下的它會逼自己跑完六步驟。

```bash
git clone https://github.com/ConardLi/web-design-skill
cp -r web-design-skill/.agents/skills/web-design-engineer .claude/skills/
```

repo 的 `demo/` 目錄有同 prompt、有/無 skill 的對照網頁，差距很明顯，建議直接點開看。

## 為什麼值得追

這份 skill 真正的價值不是「給 AI 一張設計清單」，而是示範了一種把**設計決策外顯化**的方法論。把 design tokens 寫成 markdown、把反 pattern 寫成 blocklist、把流程拆成六步——這些都是把模糊的「品味」轉成 LLM 看得懂的結構。

同樣的思路其實可以套用到任何領域：你想要 AI 在某件事上有品味，就把那件事的「不該做」和「該做」明確列出來，比寫一千字的 system prompt 更有效。

> 其他 Claude Code skill 周邊延伸閱讀：[claude-view：Claude Code 的 Mission Control]({{< ref "/post/claude-view-mission-control" >}})——監控 session、成本、token 用量的 dashboard。

## 參考資源

- [ConardLi/web-design-skill GitHub Repo](https://github.com/ConardLi/web-design-skill)
- [Claude Design — Anthropic Labs 公告](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [oklch 色彩空間說明](https://oklch.com/)
- [Claude Code SKILL.md 文件](https://docs.anthropic.com/en/docs/claude-code)
