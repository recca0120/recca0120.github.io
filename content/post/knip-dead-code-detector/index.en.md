---
title: 'Find Dead Code with Knip: The Blind Spots ESLint and depcheck Miss'
description: 'Introducing Knip, a dead code detection tool for JavaScript/TypeScript projects. Learn why ESLint and depcheck each have blind spots, and how Knip uses a full module graph to find unused files, exports, and dependencies in one pass.'
slug: knip-dead-code-detector
date: '2026-05-02T16:06:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Node.js
- TypeScript
draft: false
---

The project is two years old. There are 80 entries in `package.json` and you can't say with confidence which ones are still being used. A `utils.ts` file hasn't been touched in three months — you're not sure if anyone imports it. `shared/helpers.ts` exports a dozen functions, some of which were replaced by newer approaches months ago, but nobody deleted the old ones.

Dead code doesn't accumulate overnight. A little left over from each refactor, one forgotten dependency from each package swap. Over time the project gets heavier, but no tool ever tells you exactly what's dead.

[Knip](https://github.com/webpro-nl/knip) is built for exactly this. One command finds everything you thought was being used but isn't.

## The Blind Spots in ESLint and depcheck

Most teams reach for ESLint and depcheck to handle this kind of thing. Both have clear limits.

**ESLint** only sees a single file. It can tell you "there's a `const x` in this function that's never used," but if an entire `utils.ts` is never imported anywhere, ESLint won't notice. Its view stops at the file boundary — it can't trace cross-file reference chains.

**depcheck** only looks at `package.json`. It scans for `require` and `import` statements to see which packages are actually referenced, then flags anything that's installed but unused. But it doesn't understand TypeScript export/import semantics, and it has no concept of which files are never referenced at all.

Together they still leave a gap: cross-file export usage — nothing tracks it.

Knip works differently. Starting from configured entry points, it builds a complete module graph tracing every import, export, and dependency. Anything not connected to the graph is dead code.

## What It Finds

A single `knip` run finds:

- **Unused npm dependencies**: installed but never imported anywhere
- **Unlisted dependencies**: imported in code but missing from `package.json` (implicit reliance on a transitive dep)
- **Unused exports**: exported but never imported anywhere
- **Unused files**: entire files never referenced from anywhere
- **Unresolved imports**: imports pointing to paths or modules that don't exist

These problems used to require several tools stitched together, with gaps remaining. Knip covers all of them.

Vercel used Knip to delete nearly 300,000 lines of code. That's their own number, not marketing copy.

## Installation and Usage

No installation required — just run it:

```bash
npx knip
```

Or add it to devDependencies:

```bash
npm install -D knip
npx knip
```

Knip ships with around 150 plugins covering Vite, Vitest, Next.js, Astro, ESLint, GitHub Actions, and more. In most projects, zero configuration is needed — it auto-detects the tooling in use.

## Reading the Output

After a run, the output looks something like this:

```
Unused files (2)
src/legacy/old-helper.ts
src/utils/deprecated.ts

Unused dependencies (3)
lodash
moment
@types/node  (devDependencies)

Unused exports (5)
src/shared/helpers.ts: formatDate, parseQuery
src/utils/string.ts: capitalize, truncate, slugify
```

Each category is clear: which files are entirely unreferenced, which packages can be removed, which exports have no importers.

> The first run usually surfaces a lot. Don't try to fix everything at once. Start with unused dependencies (easy wins), then work through unused exports, and finally tackle entire unused files.

## Configuration

If you need to customize, add a `knip.json` at the project root (or a `knip` key in `package.json`):

```json
{
  "entry": ["src/index.ts", "src/pages/**/*.tsx"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["src/legacy/**", "**/*.stories.ts"],
  "ignoreDependencies": ["some-cli-tool"]
}
```

- `entry`: where to start tracing references from
- `project`: which files belong to this project
- `ignore`: paths to skip
- `ignoreDependencies`: dependencies to keep even if they appear unused (e.g. CLI tools)

## Auto-Fix

Some issues can be fixed automatically with `--fix`:

```bash
npx knip --fix
```

Currently `--fix` handles removing unused entries from `package.json` and some unused exports. Not everything is auto-fixable, but it saves a lot of manual work on the dependency side.

## VSCode Extension and MCP

Knip has a [VSCode extension](https://marketplace.visualstudio.com/items?itemName=knip.vscode-knip) that shows unused exports directly in the editor — no need to run the CLI to find out.

There's also `@knip/mcp`, which lets AI assistants call Knip when analyzing a project, helping them understand which code is actually in use.

## Dead Code Is Technical Debt

Removing unused code isn't just about making the project smaller. Every unused export is a cognitive burden — a new developer doesn't know if that function matters and has to spend time tracing it. Every unused dependency is a potential security risk and an update to manage.

Knip turns "find dead code" from a manual chore into an automated step. Run it once to clean house, then wire it into CI so dead code can't quietly accumulate again.

## References

- [Knip official documentation](https://knip.dev/)
- [GitHub — webpro-nl/knip](https://github.com/webpro-nl/knip)
- [Effective TypeScript — Recommendation: Use knip to detect dead code](https://effectivetypescript.com/2023/07/29/knip/)
