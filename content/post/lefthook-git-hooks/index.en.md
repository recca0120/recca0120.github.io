---
title: 'Ditch Husky: Speed Up Git Hooks with Lefthook'
date: '2026-03-08T09:00:00+08:00'
slug: lefthook-git-hooks
description: 'Lefthook is a fast Git hooks manager written in Go. One YAML file replaces Husky + lint-staged, parallel execution cuts commit wait time in half, with built-in monorepo support and local config overrides.'
categories:
  - Tools
  - DevOps
tags:
  - git
  - lefthook
  - husky
  - developer-tools
  - devops
---

Every commit, you wait for ESLint, Prettier, and TypeScript checks to run one by one.
Three tools, three times the wait.
[Lefthook](https://github.com/evilmartians/lefthook) runs them in parallel and cuts that time in half.

## Why Switch from Husky

Husky with lint-staged is the most common Git hooks setup, but it has some real pain points.

**Scattered configuration**: Husky v8 puts hook logic in shell scripts inside `.husky/`, while lint-staged rules live in `package.json` or `.lintstagedrc`. Understanding what actually happens on commit requires checking multiple files.

**Node.js startup overhead**: Every commit, Husky has to spin up the Node.js runtime before running lint-staged. In large projects, this adds up.

**Sequential execution**: lint-staged runs commands one after another — ESLint finishes, then Prettier starts. All those CPU cores sit idle.

**Dependency bloat**: Husky + lint-staged bring roughly 1,500 dependencies into `node_modules`.

Lefthook solves all four: it's a Go binary with no runtime dependency, a single `lefthook.yml` manages everything, parallel execution is the default, and there are zero extra dependencies.

## Installation

Lefthook supports multiple package managers and isn't tied to any language or runtime.

```bash
# npm (most convenient for frontend projects)
npm install lefthook --save-dev

# Homebrew (macOS)
brew install lefthook

# Go
go install github.com/evilmartians/lefthook/v2@latest

# Python (via pipx, keeps global env clean)
pipx install lefthook
```

After installation, initialize in your project root:

```bash
lefthook install
```

This creates the corresponding hook files in `.git/hooks/` so Git knows to invoke Lefthook.

## Basic Configuration

Everything lives in `lefthook.yml` at the project root.

```yaml
# lefthook.yml
pre-commit:
  parallel: true          # Run all commands concurrently
  commands:
    lint:
      glob: "*.{ts,tsx}"
      run: npx eslint {staged_files} --fix
      stage_fixed: true   # Re-stage files after auto-fix

    format:
      glob: "*.{ts,tsx,json,md}"
      run: npx prettier --write {staged_files}
      stage_fixed: true

    typecheck:
      run: npx tsc --noEmit

commit-msg:
  commands:
    lint-message:
      run: npx commitlint --edit {1}
```

Key points:

- **`{staged_files}`**: A built-in template variable that expands to the list of staged files
- **`glob`**: Only runs against files matching the pattern — if no staged files match, the command is skipped entirely
- **`stage_fixed: true`**: After a linter or formatter modifies files, automatically runs `git add` on them
- **`parallel: true`**: lint, format, and typecheck all run simultaneously

## Template Variables

Lefthook provides several built-in placeholders that expand at runtime:

| Variable | Description |
|----------|-------------|
| `{staged_files}` | Files currently in the staging area (for pre-commit) |
| `{push_files}` | Files included in the push (for pre-push) |
| `{all_files}` | All files matching the glob pattern |
| `{files}` | Custom file list defined by the `files` option |
| `{1}`, `{2}` | Hook arguments (e.g., commit message file path for commit-msg) |

## Monorepo Support

The `root` option makes Lefthook well-suited for monorepos. A command only runs when files in its configured directory are staged:

```yaml
pre-commit:
  parallel: true
  commands:
    frontend-lint:
      root: "packages/frontend/"     # Only applies within this directory
      glob: "*.{ts,tsx}"
      run: yarn workspace frontend lint {staged_files}
      stage_fixed: true

    backend-lint:
      root: "packages/backend/"
      glob: "*.go"
      run: golangci-lint run --fix {staged_files}
      stage_fixed: true

    shared-typecheck:
      root: "packages/shared/"
      glob: "*.ts"
      run: npx tsc --noEmit
```

When you only commit files in `packages/frontend/`, `backend-lint` is automatically skipped.

## Sequential Execution: piped

Some workflows require each step to succeed before the next runs — for example, installing dependencies before running migrations:

```yaml
post-merge:
  piped: true               # Stop if any command fails
  commands:
    install:
      glob: "{package.json,yarn.lock}"
      run: yarn install
      priority: 1           # Lower number runs first

    migrate:
      glob: "prisma/migrations/*"
      run: npx prisma migrate deploy
      priority: 2
```

`piped: true` combined with `priority` controls execution order and stops the chain on failure, preventing `migrate` from running when dependencies aren't installed.

## Skipping Execution

Lefthook supports several ways to skip commands.

**Skip during specific Git operations** (useful for merge and rebase):

```yaml
pre-commit:
  commands:
    lint:
      run: npx eslint {staged_files}
      skip:
        - merge    # Skip during git merge
        - rebase   # Skip during git rebase
```

**Local overrides**: If a command can't run on your machine (missing CLI tool, etc.), override it in `lefthook-local.yml` — this file stays out of version control:

```yaml
# lefthook-local.yml (not committed to repo)
pre-commit:
  commands:
    some-heavy-check:
      skip: true    # Temporarily disabled locally
```

## Interactive Hooks

For tools that require user input (like commitizen), add `interactive: true`:

```yaml
prepare-commit-msg:
  commands:
    commitizen:
      interactive: true
      run: npx cz
      env:
        LEFTHOOK: "0"    # Prevent recursive hook triggering
```

## Shared Configuration: remotes

For teams with multiple repositories, centralize hook configurations in a shared repo and reference it from each project:

```yaml
# lefthook.yml
remotes:
  - git_url: https://github.com/your-org/lefthook-configs
    ref: main
    configs:
      - lefthook-common.yml    # Pulled and merged from remote
```

Running `lefthook install` automatically syncs the remote config. Update hooks once, and all repos get the change.

## Migrating from Husky

If your project currently uses Husky, here's how to migrate:

```bash
# Remove Husky and lint-staged
npm uninstall husky lint-staged

# Remove the Husky config directory
rm -rf .husky

# Clean up package.json: remove "prepare" script and "lint-staged" config
# Then install Lefthook
npm install lefthook --save-dev
lefthook install
```

Take your `.husky/pre-commit` shell script and `package.json` lint-staged config and combine them into a single `lefthook.yml`.

A typical lint-staged config:

```json
// package.json (before)
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

Becomes this in Lefthook:

```yaml
# lefthook.yml (after)
pre-commit:
  parallel: true
  commands:
    eslint:
      glob: "*.{ts,tsx}"
      run: npx eslint --fix {staged_files}
      stage_fixed: true

    prettier:
      glob: "*.{ts,tsx,json,md}"
      run: npx prettier --write {staged_files}
      stage_fixed: true
```

## Summary

Lefthook works well when:

- You're tired of managing hooks across multiple files with Husky + lint-staged
- Your monorepo needs different tools to run for different directories
- Your project uses multiple languages and you don't want to be tied to Node.js
- You want CI-like automation in post-merge hooks

For small frontend projects, Husky is still fine. But once your project grows or commit wait times start annoying you, Lefthook is worth the switch.
