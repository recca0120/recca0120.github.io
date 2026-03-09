---
title: 'Mole: Clear 95GB of macOS Junk with One Command'
date: '2026-03-09T09:00:00+08:00'
slug: mole-macos-cleaner
image: cover.jpg
description: 'Mole is a 38K-star macOS cleaner. mo clean removes caches deep in the system, mo uninstall removes apps plus all leftover files, mo purge clears node_modules and build artifacts. Free, open-source, dry-run safe.'
categories:
  - Tools
tags:
  - macos
  - mole
  - developer-tools
  - productivity
---

Your disk is almost full. Open Storage and "Other" has eaten 80GB.
CleanMyMac costs money. Manually hunting caches in Finder takes forever.
[Mole](https://github.com/tw93/Mole) clears 95GB with one command.

## What Is Mole

Mole is a macOS system cleaner built by Taiwanese developer [tw93](https://github.com/tw93), written in Shell and Go, with 38K stars on GitHub. It brings the functionality of paid tools like CleanMyMac into a CLI — free, open-source, no system extension required.

Six core commands: `clean` (remove junk), `uninstall` (remove apps), `optimize` (system tuning), `analyze` (disk explorer), `status` (live dashboard), and `purge` (clear dev artifacts).

## Installation

```bash
# Homebrew
brew install tw93/tap/mole

# Or via install script
curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash
```

Verify:

```bash
mo --version
```

All subcommands use `mo` (not `mole`).

## mo clean: Deep System Cleanup

```bash
mo clean
```

Clears: system caches, log files, temp files, browser caches (Chrome, Safari, Firefox), Xcode derived data, iOS simulator caches, and app-specific cache directories.

Not sure what it'll delete? Run a dry-run first:

```bash
mo clean --dry-run
```

Lists every path and size it would remove. Confirm it looks safe, then run for real.

Want to protect specific items? Use the whitelist:

```bash
mo clean --whitelist
```

An interactive UI lets you check off items to preserve.

## mo uninstall: Remove Apps and All Their Leftovers

Dragging an app to the Trash leaves behind Library preferences, Launch Agents, support files — sometimes hundreds of megabytes. Mole's uninstaller removes everything:

```bash
mo uninstall
```

Shows a list of installed apps. Select what you want gone, confirm, and Mole deletes the app plus all its associated files. Ideal for trial software you used once.

## mo purge: Clear Development Artifacts

This one is the most useful for developers. `node_modules`, Rust's `target/`, Go build caches — these accumulate to tens of gigabytes fast:

```bash
mo purge
```

Scans your home directory for projects and lists all purgeable artifacts with checkboxes. Select what to delete and confirm.

Scan specific directories:

```bash
mo purge --paths ~/Sites,~/Projects
```

Preview first:

```bash
mo purge --dry-run
```

## mo analyze: Find Disk Space Hogs

```bash
mo analyze
```

An interactive disk browser with percentage bars showing space usage per directory. Drill down level by level to find what's eating your storage.

Analyze an external drive:

```bash
mo analyze /Volumes
```

## mo optimize: System Tuning

```bash
mo optimize
```

Does several things: rebuilds the Spotlight index, flushes DNS cache, rebuilds the Launch Services database, and clears font caches. If your system has been running for a while and feels sluggish, this usually helps.

Use the whitelist to skip services you don't want touched:

```bash
mo optimize --whitelist
```

## mo status: Live System Dashboard

```bash
mo status
```

A real-time terminal dashboard showing CPU, memory, disk, network traffic, and battery status in ASCII charts. Faster than opening Activity Monitor for a quick health check.

## Raycast / Alfred Integration

If you use Raycast or Alfred, you can trigger Mole directly from the launcher:

```bash
# Override the terminal Mole opens in
MO_LAUNCHER_APP=iTerm mo clean
```

Or set it permanently in your shell config:

```bash
# ~/.zshrc
export MO_LAUNCHER_APP=iTerm
```

## Mole vs CleanMyMac

CleanMyMac has a subscription fee and a polished GUI, but navigating it takes multiple clicks. Mole is pure CLI — dry-run to preview, confirm, done. For developers who live in the terminal, it's more direct.

What Mole doesn't have: malware scanning and privacy protection features that CleanMyMac includes. For everyday junk removal, app uninstallation, and clearing dev artifacts, Mole covers everything a developer needs.

Developers → Mole. General users → CleanMyMac. That's roughly the split.
