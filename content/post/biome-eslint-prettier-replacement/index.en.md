---
title: 'Replace ESLint + Prettier with Biome: 35x Faster, One Tool'
date: '2026-03-10T09:00:00+08:00'
slug: biome-eslint-prettier-replacement
image: featured.jpg
description: 'Biome is a Rust-based frontend toolchain that formats 35x faster than Prettier, includes 455 lint rules covering ESLint + TypeScript ESLint, and replaces five config files with one biome.json. Auto-migration included.'
categories:
  - Tools
  - Frontend
tags:
  - biome
  - eslint
  - prettier
  - typescript
  - developer-tools
---

Your project root is cluttered: `.eslintrc.json`, `.eslintignore`, `.prettierrc`, `.prettierignore`, `lint-staged.config.js`.
Change one rule, wait five seconds for ESLint and Prettier to finish before committing.
[Biome](https://biomejs.dev/) is one tool, one config file, 35x faster.

## What Is Biome

Biome is a Rust-based frontend toolchain that combines a formatter and linter into a single CLI. Its formatter achieves 97% compatibility with Prettier, and its linter has 455 rules covering what used to require ESLint + TypeScript ESLint + several plugins.

Supported languages: JavaScript, TypeScript, JSX, TSX, JSON, CSS, HTML, GraphQL.

AWS, Google, Microsoft, Discord, Vercel, and Cloudflare all use it.

## Installation

```bash
# npm (-E pins the exact version for consistent behavior across machines)
npm i -D -E @biomejs/biome

# pnpm
pnpm add -D -E @biomejs/biome

# yarn
yarn add -D -E @biomejs/biome
```

Initialize a config file:

```bash
npx @biomejs/biome init
```

This generates `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

## Three Core Commands

```bash
# Format files
npx @biomejs/biome format --write .

# Lint and auto-fix
npx @biomejs/biome lint --write .

# Do everything: format + lint + organize imports
npx @biomejs/biome check --write .
```

For CI, use `biome ci` — it returns a non-zero exit code on issues, failing the pipeline:

```bash
npx @biomejs/biome ci .
```

## biome.json Configuration

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",   // "space" or "tab"
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",        // Single quotes
      "trailingCommas": "all",       // Trailing commas everywhere
      "semicolons": "asNeeded"       // No mandatory semicolons
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noDebugger": "error"
      },
      "correctness": {
        "noUnusedVariables": {
          "level": "warn",
          "fix": "none"            // Detect but don't auto-fix
        }
      }
    }
  },
  "organizeImports": {
    "enabled": true
  },
  "files": {
    "ignore": ["dist/**", "node_modules/**", "*.min.js"]
  }
}
```

### Language-Specific Settings

Different languages can have different rules. For example, to disable formatting for JSON:

```json
{
  "json": {
    "formatter": {
      "enabled": false
    }
  }
}
```

### Lint Rule Categories

Biome organizes rules into eight groups:

- **correctness**: Guaranteed errors or dead code
- **suspicious**: Likely incorrect patterns
- **style**: Consistent, idiomatic code
- **complexity**: Overly complex constructs
- **performance**: Performance issues
- **security**: Security vulnerabilities
- **a11y**: Accessibility problems
- **nursery**: New experimental rules (opt-in)

Disable an entire group:

```json
{
  "linter": {
    "rules": {
      "a11y": "off"
    }
  }
}
```

## Migrating from ESLint + Prettier

Biome provides automatic migration commands:

```bash
# Migrate from Prettier
npx @biomejs/biome migrate prettier --write

# Migrate from ESLint
npx @biomejs/biome migrate eslint --write
```

`migrate prettier` converts `.prettierrc` settings into Biome's formatter config.

`migrate eslint` reads your `.eslintrc.json` (or flat config), maps what it can to Biome rules, and adds comments explaining anything it couldn't convert.

After migration, clean up:

```bash
# Remove old tools
npm uninstall eslint prettier @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier eslint-plugin-prettier

# Delete old config files
rm .eslintrc.json .eslintignore .prettierrc .prettierignore
```

Then run a check to verify everything works:

```bash
npx @biomejs/biome check --write .
```

## Update package.json Scripts

Before:

```json
{
  "scripts": {
    "lint": "eslint --ext .ts,.tsx src",
    "format": "prettier --write src"
  }
}
```

After:

```json
{
  "scripts": {
    "lint": "biome lint --write .",
    "format": "biome format --write .",
    "check": "biome check --write ."
  }
}
```

## Using with Lefthook

If you use [Lefthook for Git hooks](/en/p/lefthook-git-hooks/), replace Husky + lint-staged + ESLint + Prettier with:

```yaml
# lefthook.yml
pre-commit:
  commands:
    biome:
      glob: "*.{js,ts,jsx,tsx,json,css}"
      run: npx @biomejs/biome check --write {staged_files}
      stage_fixed: true
```

One command replaces three tools.

## Performance

Official benchmark: formatting 171,127 lines across 2,104 files on an Intel Core i7 1270P — Biome is **35x faster** than Prettier.

In practice: `biome check` on large projects usually completes in under a second. What took 10-15 seconds with ESLint + Prettier is now nearly instant.

## Caveats

Not every ESLint plugin has a Biome equivalent. If you rely on specific plugins (some `eslint-plugin-import` rules, for example), verify Biome covers them before migrating. Most common TypeScript ESLint rules are supported.

Test on a small project first, then roll it out to your main codebase once you're confident.

## References

- [Biome Official Documentation](https://biomejs.dev/docs/)
- [Biome on GitHub](https://github.com/biomejs/biome)
- [Biome Migration Guide from ESLint / Prettier](https://biomejs.dev/guides/migrate-eslint-prettier/)
- [Biome Lint Rules Reference](https://biomejs.dev/linter/rules/)
- [Biome Prettier Challenge Win — Performance Blog Post](https://biomejs.dev/blog/biome-wins-prettier-challenge/)

