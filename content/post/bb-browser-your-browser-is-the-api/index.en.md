---
title: 'bb-browser: No Scraping, No API Keys — Your Browser Is the API'
description: 'bb-browser runs code directly in your real browser tabs, using your existing cookies to fetch data. 36 platforms, 103 commands, and it doubles as an MCP server for Claude Code to access the entire web.'
slug: bb-browser-your-browser-is-the-api
date: '2026-04-07T11:34:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- ai-agent
- MCP
- browser-automation
- cli
draft: false
---

Want Twitter search results? Traditional approaches give you three paths: apply for an API key (rate-limited), write a scraper (get IP-banned), or use Playwright with a headless browser (detected as non-human).

[bb-browser](https://github.com/epiral/bb-browser) takes a fourth path: use the Chrome you already have open. You're logged into Twitter, the cookies are right there, and bb-browser runs `fetch()` inside that tab. From the website's perspective, it's just you browsing.

## How It Differs from Scrapers and Playwright

Let's get the differences clear.

| | bb-browser | Playwright / Selenium | Scrapers (requests, Scrapy) |
|---|---|---|---|
| Browser | Your real Chrome | Isolated headless browser | No browser |
| Login state | Already logged in | Must re-login or inject cookies | Manual cookie handling |
| Anti-bot detection | Invisible (it IS the real user) | Easily detected | Easily blocked |
| Fingerprint | Your real fingerprint | Headless browser fingerprint | No fingerprint |

The key insight: bb-browser doesn't launch a new browser instance. It connects to your running Chrome via CDP (Chrome DevTools Protocol) and injects code into tabs. The User-Agent, cookies, and TLS fingerprint the website sees are all real — because it is your actual browser.

## Architecture

```
AI Agent (Claude Code, Codex, Cursor)
         │ CLI or MCP (stdio)
         ▼
bb-browser CLI ──HTTP──▶ Daemon ──CDP WebSocket──▶ Real Browser
                            │
                     ┌──────┴──────┐
                     │ Per-tab event│
                     │ cache (net,  │
                     │ console)     │
                     └─────────────┘
```

bb-browser runs a daemon (default `127.0.0.1:19824`) that communicates with Chrome via CDP WebSocket. CLI commands go to the daemon, which executes them in the corresponding tab.

## Installation and Basic Usage

```bash
npm install -g bb-browser
```

Pull community adapters:

```bash
bb-browser site update
```

Try a command:

```bash
bb-browser site zhihu/hot
```

This opens a Zhihu tab (if you're already logged in), uses your cookies to fetch the trending questions list.

### Structured Output

All commands support `--json` and `--jq`:

```bash
bb-browser site xueqiu/hot-stock 5 --jq '.items[] | {name, changePercent}'
# {"name":"云天化","changePercent":"2.08%"}
# {"name":"东芯股份","changePercent":"-7.60%"}
```

### Browser Operations

Beyond running adapters, you can directly control the browser:

```bash
bb-browser open https://example.com     # Open URL
bb-browser snapshot -i                  # Accessibility tree snapshot
bb-browser click @3                     # Click element
bb-browser fill @5 "hello"             # Fill input
bb-browser eval "document.title"       # Execute JavaScript
bb-browser fetch URL --json            # Authenticated fetch
bb-browser screenshot                  # Take screenshot
```

## 36 Platforms, 103 Commands

bb-browser's adapters cover a wide range:

- **Search**: Google, Baidu, Bing, DuckDuckGo
- **Social**: Twitter/X, Reddit, Weibo, Xiaohongshu, LinkedIn
- **Dev**: GitHub, StackOverflow, Hacker News, npm, PyPI, arXiv, V2EX, Dev.to
- **News**: BBC, Reuters, 36kr, Toutiao
- **Video**: YouTube, Bilibili
- **Finance**: Xueqiu, Yahoo Finance, Eastmoney
- **Knowledge**: Wikipedia, Zhihu

Each adapter is a single JavaScript file, community-driven. To add a new platform, write a JS file and submit it to the `bb-sites` repo.

## Three Levels of Adapter Complexity

Not every website is equally straightforward. bb-browser categorizes adapters into three levels:

| Level | Approach | Examples | Dev Time |
|-------|----------|----------|----------|
| Level 1 | Direct fetch with cookies | Reddit, GitHub | ~1 min |
| Level 2 | Bearer token + CSRF extraction | Twitter, Zhihu | ~3 min |
| Level 3 | Webpack injection or Pinia store | Twitter search | ~10 min |

Level 1 is simplest — some sites' APIs work with just cookies. Level 3 is most complex, requiring reverse engineering of frontend bundles, extracting data from Webpack's `__webpack_require__` or Vue's Pinia store.

## MCP Server for AI Agents

This is bb-browser's most compelling use case. Configure it as an MCP server, and Claude Code or Cursor can directly access any website your browser can see.

```json
{
  "mcpServers": {
    "bb-browser": {
      "command": "npx",
      "args": ["-y", "bb-browser", "--mcp"]
    }
  }
}
```

Once configured, you can tell Claude Code "search arXiv for recent RAG papers" and it will search through bb-browser using your real browser.

Without bb-browser, an AI agent can only work with files and the terminal. With bb-browser, it can access the entire internet — as you.

I previously wrote about [CLI-Anything](/en/2026/03/15/cli-anything-agent-native-cli/), which wraps desktop software as CLIs for agents to call, and [AionUi](/en/2026/04/07/aionui-ai-cowork-app/), which provides a unified interface for managing multiple agents. bb-browser extends agent capability from yet another angle: letting it browse the web using your real browser.

## Things to Consider

A few things to think through before using it:

- **It uses your real account**. bb-browser acts on your behalf. If the operation frequency is too high, your account might get flagged. It's not an invisible scraper — it IS you
- **Security**. The daemon binds to localhost by default, but if you open it to `0.0.0.0`, anyone who can reach your machine can control your browser. Use Tailscale or ZeroTier for safer remote access
- **Adapter quality varies**. Community-driven means broad coverage, but some adapters may lag behind website redesigns
- **macOS users**: watch for IPv6 issues — add `--host 127.0.0.1` to the daemon command

## When to Use It

bb-browser isn't for scraping millions of records. Use Scrapy for that.

It's ideal for:

- Giving AI agents web access without applying for API keys one by one
- Quickly pulling structured data from platforms you're already logged into
- Cross-platform research — query arXiv, Twitter, GitHub, Zhihu, and StackOverflow in under a minute

One command does what used to require writing a scraper, and it won't get blocked.

## References

- [bb-browser GitHub Repository](https://github.com/epiral/bb-browser)
- [bb-sites Community Adapters](https://github.com/nicepkg/bb-sites)
- [Chrome DevTools Protocol Documentation](https://chromedevtools.github.io/devtools-protocol/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
