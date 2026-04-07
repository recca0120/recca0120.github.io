---
title: 'AionUi: One Interface for 12+ AI Agents — A Free, Open-Source Cowork Desktop App'
description: 'AionUi is a free, open-source AI Cowork desktop app built with Electron + React. Run Claude Code, Codex, Qwen Code, and 12+ agents in one interface, with 20+ model platforms and scheduled tasks.'
slug: aionui-ai-cowork-app
date: '2026-04-07T11:03:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- ai-agent
- electron
- claude-code
- MCP
draft: false
---

You've got Claude Code installed. Also Codex. Maybe Qwen Code for Chinese-language tasks. Each tool gets its own terminal window, MCP configs are duplicated across tools, and conversation history is scattered everywhere.

[AionUi](https://github.com/iOfficeAI/AionUi) tackles exactly this: one desktop app that brings all your AI agents under a single interface. Free, open-source, Apache 2.0 licensed.

## What It Does

AionUi is a cross-platform desktop app built with Electron + React, supporting macOS, Windows, and Linux. Its core purpose is unified management of multiple AI coding agents.

### Supported Agents

AionUi auto-detects CLI tools installed on your machine. Currently supported:

- Claude Code, Codex, Qwen Code, Goose AI, OpenClaw, Augment Code
- iFlow CLI, CodeBuddy, Kimi CLI, OpenCode, Factory Droid, GitHub Copilot

Over 12 agents total. No extra configuration needed — install the CLI and it shows up in AionUi. If you don't have any CLI tools installed, AionUi has its own built-in agent that works with Google login or API key authentication.

### 20+ Model Platforms

Wide model selection:

- **Major platforms**: Gemini, Claude, OpenAI
- **Cloud**: AWS Bedrock
- **Chinese platforms**: Dashscope (Qwen), Zhipu, Moonshot (Kimi), Baidu Qianfan, Tencent Hunyuan, ModelScope
- **Local models**: Ollama, LM Studio

If you're in mainland China and can't easily access OpenAI or Claude APIs, just switch to Dashscope or Zhipu. For fully offline work, run Ollama with local models.

### Configure MCP Once, Sync Everywhere

This is the most practical design choice. Configure MCP (Model Context Protocol) tools once in AionUi, and all agents sync automatically. No more maintaining separate `mcp.json` files for each agent — change it in one place, it applies everywhere.

## 12 Built-in Professional Assistants

AionUi isn't just an agent launcher. It comes with 12 pre-built assistants:

| Assistant | Purpose |
|-----------|---------|
| Cowork | Automated task execution |
| PPTX Generator | Presentation creation |
| PDF to PPT | Format conversion |
| 3D Game | Single-file game prototyping |
| UI/UX Pro Max | 57 styles, 95 color palettes |
| Beautiful Mermaid | Flowcharts, sequence diagrams |
| Planning with Files | File-based project planning |

The Office features (PPT, Word, Excel) are powered by OfficeCLI, producing editable `.pptx`, `.docx`, and `.xlsx` files — not PDF screenshots. PPT output even supports Morph transition animations.

## Scheduled Tasks: 24/7 Automation

This feature is uncommon in agent tools. You can set up scheduled tasks using natural language, like "every morning at 9am, summarize yesterday's Git commit log." AionUi converts it to a cron expression and runs it automatically.

Each scheduled task is bound to a conversation, maintaining context. Results are sent back to the conversation window, and can also be pushed to Telegram, Lark (Feishu), or DingTalk.

## Preview Panel

AionUi has a built-in file preview supporting many formats:

- **Documents**: PDF, Word, Excel, PowerPoint
- **Code**: 30+ languages with syntax highlighting
- **Images**: PNG, JPG, SVG, WebP, and more
- **Markup**: Markdown and HTML with live editing

It also tracks file changes, shows Git version history, and supports one-click rollback.

## WebUI Remote Access

You don't have to sit in front of your computer to use a desktop app. AionUi can serve a WebUI, accessible via QR code or password login from your phone or another computer. Supports both LAN and cross-network access.

Combined with Telegram, Lark, and DingTalk bot integration, you can send commands to AI agents from your phone and receive results in your chat groups.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron |
| UI | React |
| CSS | UnoCSS |
| Build | Vite |
| Testing | Vitest + Playwright |
| Database | SQLite (local) |
| Language | TypeScript |

All data is stored locally in SQLite — nothing gets uploaded to any server. With local models (Ollama), the entire workflow can run completely offline.

## Installation

Download the installer for your platform from [GitHub Releases](https://github.com/iOfficeAI/AionUi/releases). Homebrew is also supported on macOS.

Once installed, just open the app. If Claude Code or Codex is already on your machine, AionUi detects them automatically. Otherwise, use the built-in agent with an API key or Google login to get started.

## Compared to Using Claude Code Alone

Claude Code is powerful, but it's a terminal tool. AionUi doesn't aim to replace it — it puts Claude Code alongside other agents in one managed workspace.

Key differences:

- **Multi-agent**: Claude Code only runs Claude; AionUi runs multiple agents simultaneously
- **GUI**: Full desktop interface with file preview, Office generation, and image processing built in
- **Scheduling**: Claude Code has no built-in scheduling; AionUi runs tasks 24/7 automatically
- **Price**: Claude Code requires API costs or a $100/month subscription; AionUi itself is free
- **Model choice**: Not locked to one provider — 20+ platforms available

If you're interested in the AI agent tool ecosystem, I previously wrote about [CLI-Anything: A Universal Bridge for AI Agents to Operate Any Software](/en/2026/03/15/cli-anything-agent-native-cli/), which approaches the problem from the opposite angle — wrapping existing software as CLIs for agents to call. AionUi takes the agent management perspective instead.

## Current State

AionUi is iterating rapidly, with 4,400+ commits on GitHub. The community is active on Discord (English) and WeChat groups (Chinese).

One caveat: while the star count is impressive, Electron apps typically have significant memory overhead. If you only use one agent, running the CLI in a terminal is lighter weight. AionUi's value shows when you genuinely need multiple agents, want GUI management, or require scheduling and Office generation features.

## References

- [AionUi GitHub Repository](https://github.com/iOfficeAI/AionUi)
- [AionUi Official Website](https://www.aionui.com)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Electron Documentation](https://www.electronjs.org/)
