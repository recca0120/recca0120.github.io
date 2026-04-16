---
title: 'Overmind: Managing Multiple Local Services Better Than foreman'
description: 'Overmind is a Procfile process manager that integrates tmux, letting you connect to and restart individual processes. It solves foreman log buffering and color stripping issues — ideal for Rails and full-stack local development.'
slug: overmind-procfile-process-manager
date: '2026-04-16T18:45:00+08:00'
image: featured.png
categories:
- DevOps
tags:
- overmind
- tmux
- Procfile
- Rails
draft: false
---

Running a full-stack Rails project locally means at least four services: Rails server, Sidekiq, frontend build, and CSS watch. The old approach was four terminal tabs or foreman to bundle them together.

After using foreman for a while, a few things got to me: log colors disappearing, output delayed by several seconds, and one dying process taking down everything else. [Overmind](https://github.com/DarthSim/overmind) fixes all of this — and adds a few features that become hard to live without.

## What Is a Procfile

Overmind reads a `Procfile`, a format popularized by Heroku that defines which services your application provides and what commands to run them:

```Procfile
web: bin/rails server
worker: bundle exec sidekiq
assets: yarn build --watch
css: yarn tailwind --watch
```

One line per service, format is `name: command`. This file also works as deployment config on Heroku, Render, and Railway — same file locally and in production, fewer environment mismatches.

## Installation

On macOS, install tmux first (Overmind's core dependency):

```bash
brew install tmux
brew install overmind
```

On Linux:

```bash
apt-get install tmux
# Download the latest release binary, or:
go install github.com/DarthSim/overmind/v2@latest
```

## Basic Usage

In any directory containing a `Procfile`:

```bash
overmind start
# or the short alias
overmind s
```

All services start up with their log output collected in one stream, each process name color-coded.

## Features That Make the Difference

### Restart a Single Process

I use this daily. After changing a Sidekiq worker, I don't need to stop and restart the whole stack:

```bash
overmind restart worker
```

Only worker restarts. Web and frontend build keep running uninterrupted.

### Connect to a Process

Need to interact with a process directly — check output or type a command:

```bash
overmind connect web
```

This opens a tmux window attached to that process. Press `Ctrl+b d` to detach without stopping it.

### Let a Process Die Without Killing Others

A frontend build that exits when done shouldn't tear down the whole stack:

```bash
overmind start -c assets,npm_install
# or via env var
OVERMIND_CAN_DIE=assets,npm_install overmind start
```

### Auto-restart

For processes that occasionally crash:

```bash
overmind start -r worker
OVERMIND_AUTO_RESTART=worker overmind start
```

Use `all` to auto-restart everything:

```bash
overmind start -r all
```

## Why Logs Don't Get Clipped or Delayed

foreman's log issues come from how processes detect their output destination. When a program's stdout isn't a real terminal, it switches to buffered mode — color escape codes get stripped and output batches until the buffer fills.

Overmind runs each process in a real **tmux window** and uses tmux's **control mode** to capture output. From the process's perspective it's writing to a terminal, so colors stay intact and output is immediate.

## Environment File Configuration

Rather than typing long flags every time, create `.overmind.env` in your project:

```bash
OVERMIND_PORT=3000
OVERMIND_AUTO_RESTART=worker
OVERMIND_CAN_DIE=assets
```

Overmind reads this automatically on start. You can also put global settings in `~/.overmind.env`.

## Port Assignment

Overmind sets the `PORT` env variable for each process automatically:

- First process: `PORT=5000`
- Second: `PORT=5100`
- And so on (step defaults to 100)

Use it in your Procfile:

```Procfile
web: bin/rails server -p $PORT
```

Change the base port:

```bash
overmind start -p 3000
```

Reference another process's port:

```Procfile
web: bin/rails server -p $PORT
proxy: ngrok http $OVERMIND_PROCESS_web_PORT
```

## Running Only Some Services

When you only need web and worker, not the frontend build:

```bash
# Run only specified services
overmind start -l web,worker

# Exclude specified services
overmind start -x assets,css
```

## Scaling

Run multiple instances of a process:

```bash
overmind start -m web=1,worker=3
```

Three worker instances start with ports assigned sequentially.

## foreman vs Overmind

| Feature | foreman | Overmind |
|---------|---------|----------|
| Basic Procfile support | ✓ | ✓ |
| Log color preservation | Often broken | Works correctly |
| Real-time log output | Buffered | Immediate |
| Restart single process | ✗ | ✓ |
| Connect to process | ✗ | ✓ |
| Can-die processes | ✗ | ✓ |
| Auto-restart | ✗ | ✓ |
| Dependency | None | tmux |

The main tradeoff is the tmux dependency. If tmux isn't available or you only need basic Procfile management, the same author built [Hivemind](https://github.com/DarthSim/hivemind) — no tmux integration, but no log problems either.

## A Real Procfile Example

Rails + Sidekiq + Vite:

```Procfile
web: bin/rails server -p $PORT
worker: bundle exec sidekiq -C config/sidekiq.yml
vite: bin/vite dev
```

With `.overmind.env`:

```bash
OVERMIND_PORT=3000
OVERMIND_AUTO_RESTART=worker
OVERMIND_CAN_DIE=vite
```

Start everything:

```bash
overmind s
```

Three services, each in their own tmux window, colors intact, worker auto-restarts on crash, vite can exit without taking down the rest.

## References

- [Overmind GitHub Repository](https://github.com/DarthSim/overmind)
- [Hivemind — Lightweight Version (no tmux)](https://github.com/DarthSim/hivemind)
- [Introducing Overmind and Hivemind — Evil Martians](https://evilmartians.com/chronicles/introducing-overmind-and-hivemind)
- [Heroku Procfile Format](https://devcenter.heroku.com/articles/procfile)
