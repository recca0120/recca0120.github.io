---
title: 'EmDash: A Full-Stack TypeScript CMS Built on Astro + Cloudflare — Can It Replace WordPress?'
description: 'EmDash is a full-stack TypeScript CMS built on Astro and Cloudflare, featuring sandboxed plugins, Portable Text content, and multi-database support as a modern WordPress alternative.'
slug: emdash-cms-astro-cloudflare
date: '2026-04-07T05:36:00+08:00'
image: featured.jpg
categories:
- Frontend
tags:
- Astro
- Cloudflare
- TypeScript
- CMS
draft: false
---

WordPress powers 43% of the web, but it was born in 2003. PHP + MySQL, plugins with full database access, content stored as HTML coupled to the DOM. After twenty years, it's fair to rethink the whole thing.

[EmDash](https://github.com/emdash-cms/emdash) is that attempt. Full-stack TypeScript, running on Astro, backed by Cloudflare infrastructure. Still in beta, but the architecture is worth examining.

## How It Differs from WordPress

Let's start with the biggest differences.

### Sandboxed Plugin Isolation

96% of WordPress security vulnerabilities come from plugins. The reason is straightforward: plugins run in the same PHP process as the core, with full access to the database and filesystem. One bad plugin exposes the entire site.

EmDash uses Cloudflare Workers' Dynamic Worker Loaders for isolation. Each plugin must declare a capability manifest listing exactly what permissions it needs:

```typescript
export default () =>
  definePlugin({
    id: "my-plugin",
    capabilities: ["read:content", "email:send"],
    hooks: {
      "content:afterSave": async (event, ctx) => {
        // Can only operate within declared permissions
      }
    }
  });
```

No `write:content` declaration, no write access. This fundamentally limits a plugin's attack surface.

### Content Format: Portable Text Instead of HTML

WordPress stores content as HTML. Seems intuitive, but the problem is that HTML is tightly coupled to presentation. If you want the same content for an app, email, or API, you have to re-parse the DOM.

EmDash uses [Portable Text](https://www.portabletext.org/), storing content as structured JSON. One piece of content can be processed by different renderers without reverse-engineering semantics from HTML.

### Full-Stack TypeScript

WordPress is PHP with JavaScript layered on top for the frontend. EmDash is TypeScript from schema definition to frontend rendering, and schema changes generate types automatically:

```bash
npx emdash types
```

This command generates TypeScript type definitions from the database schema. Change the schema, and your IDE immediately shows type errors.

## Architecture

### No Database Lock-in

EmDash uses [Kysely](https://kysely.dev/) as its database abstraction layer, supporting multiple SQL dialects:

| Environment | Database | Storage | Session | Plugin Isolation |
|-------------|----------|---------|---------|-----------------|
| Cloudflare | D1 | R2 | KV | Worker isolates |
| Self-hosted | SQLite / PostgreSQL | S3-compatible / local | Redis / file | In-process mode |

Want to run on Cloudflare? Use D1 + R2. Want to self-host? Use SQLite + local filesystem. No vendor lock-in.

### Astro Integration

EmDash is an Astro integration, configured like any other Astro plugin:

```typescript
// astro.config.mjs
import emdash from "emdash/astro";
import { d1 } from "emdash/db";

export default defineConfig({
  integrations: [emdash({ database: d1() })]
});
```

Querying content uses `getEmDashCollection`, with syntax similar to Astro's Content Collections:

```astro
---
import { getEmDashCollection } from "emdash";
const { entries: posts } = await getEmDashCollection("posts");
---

{posts.map((post) => (
  <article>{post.data.title}</article>
))}
```

The key point: this data is fetched live from the database — no need to rebuild the entire site.

## Feature Overview

### Content Management

- Customizable content types (collections) built through the admin UI
- TipTap rich text editor
- Version control, drafts, scheduled publishing
- FTS5 full-text search

### Authentication

Passkey-first (WebAuthn) by default, with OAuth and Magic link as alternatives. Four permission levels: Administrator, Editor, Author, Contributor.

### Plugin Capabilities

Plugins go beyond simple hooks:

- KV storage
- Settings management
- Admin pages
- Dashboard widgets
- Custom block types
- API routes

### AI Integration

EmDash natively supports MCP (Model Context Protocol), allowing direct content and schema manipulation through Claude or ChatGPT. Agent skills help with plugin and theme development.

### WordPress Migration

Supports WXR export import, REST API integration, and WordPress.com import. A `gutenberg-to-portable-text` package converts Gutenberg blocks to Portable Text.

## Quick Start

```bash
npm create emdash@latest
```

This runs a scaffold where you pick a template. Three options:

- **blog**: categories, tags, full-text search, RSS, dark mode
- **marketing**: hero section, pricing cards, FAQ, contact form
- **portfolio**: project grid, tag filtering, case study pages

Local development:

```bash
git clone https://github.com/emdash-cms/emdash.git
cd emdash
pnpm install
pnpm build
pnpm --filter emdash-demo seed
pnpm --filter emdash-demo dev
```

Admin panel at `http://localhost:4321/_emdash/admin`.

## Current Limitations

EmDash is still in beta. A few things to keep in mind:

- Worker isolate sandboxing requires a paid Cloudflare account; free accounts run in-process mode (no sandbox)
- The ecosystem is just starting — third-party plugins and themes can't compete with WordPress's library
- Documentation is still being built; some features require reading source code
- Portable Text has a steeper learning curve than HTML, especially for custom blocks

## Who Is This For

If you're a heavy WordPress user who needs thousands of plugins and clients installing their own themes, EmDash can't replace that yet.

But if you're already using Astro and want a backend that lets non-technical people edit content — without wiring up a headless CMS API — EmDash's integration is seamless. Full-stack TypeScript, types that update with schema changes, and near-zero-config Cloudflare deployment.

It's not trying to kill WordPress, but it demonstrates what a CMS designed in 2026 can look like.

## References

- [EmDash GitHub Repository](https://github.com/emdash-cms/emdash)
- [Portable Text Official Website](https://www.portabletext.org/)
- [Kysely - Type-safe SQL Query Builder](https://kysely.dev/)
- [Astro Documentation](https://docs.astro.build/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
