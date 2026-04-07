---
title: 'NodeWarden: Bitwarden on Cloudflare Workers — No Server Required'
description: 'NodeWarden is a third-party Bitwarden-compatible server running on Cloudflare Workers with D1 for data and R2/KV for attachments. No VPS needed, runs on the free tier.'
slug: nodewarden-bitwarden-cloudflare-workers
date: '2026-04-07T17:34:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- Cloudflare
- Bitwarden
- TypeScript
- serverless
draft: false
---

Self-hosting Bitwarden gives you two paths. The official version requires Docker and eats memory. [Vaultwarden](https://github.com/dani-garcia/vaultwarden) rewrites it in Rust, much lighter, but you still need a VPS, HTTPS configuration, regular updates, and database backups.

[NodeWarden](https://github.com/shuaiplus/nodewarden) takes a third path: run directly on Cloudflare Workers. No VPS, no SSL management, no uptime monitoring. Cloudflare's free tier is enough.

## How It Differs from Vaultwarden

Vaultwarden is the most popular third-party Bitwarden server, written in Rust, running in Docker. NodeWarden is written in TypeScript, running on Cloudflare Workers.

| | Vaultwarden | NodeWarden |
|---|---|---|
| Language | Rust | TypeScript |
| Deployment | Docker / VPS | Cloudflare Workers |
| Database | SQLite / MySQL / PostgreSQL | Cloudflare D1 |
| Attachment storage | Local filesystem | R2 or KV |
| SSL | Self-configured | Cloudflare handles it |
| Maintenance | Manual updates and backups | Fork + auto-sync upstream |
| Cost | VPS monthly fee | Cloudflare free tier |
| Organizations/Collections | Supported | Not supported |

The biggest difference is operational burden. Vaultwarden needs you to maintain a VPS. NodeWarden is fully serverless. The downside is no organization or collection features, making it unsuitable for teams.

## Technical Architecture

NodeWarden is built entirely on Cloudflare's infrastructure:

- **Compute**: Cloudflare Workers (serverless)
- **Database**: D1 (Cloudflare's SQLite)
- **Attachment storage**: R2 (object storage) or KV (key-value)
- **Frontend**: Preact (original Web Vault interface)

Two storage options:

| Option | Credit card required | Max attachment size | Free quota |
|--------|---------------------|-------------------|------------|
| R2 | Yes | 100 MB (adjustable) | 10 GB |
| KV | No | 25 MiB (hard limit) | 1 GB |

If you don't want to add a credit card, use KV mode. 1 GB free quota is more than enough for personal password management. Only consider R2 if you need large attachments.

## Feature Comparison

Compared to official Bitwarden, everything needed for personal use is covered:

- Web Vault password manager interface
- Full sync (`/api/sync`), compatible with official clients
- Attachment upload and download
- Send feature (text and files)
- Import/export (Bitwarden JSON/CSV, ZIP with attachments)
- TOTP and Steam TOTP
- Multi-user (invitation code registration)
- Password hints (viewable directly in web, no email required)

NodeWarden adds one feature the official version lacks: a **cloud backup center**. Supports WebDAV and E3 protocol for scheduled backups, including `db.json`, `manifest.json`, and `attachments/` directory. During restoration, missing attachments are safely skipped without leaving broken records.

Not supported: organizations, collections, permission management, SSO, SCIM, enterprise directories. These are team features unnecessary for personal use.

### Client Compatibility

Tested and working:

- Windows desktop
- Mobile apps (iOS / Android)
- Browser extensions
- Linux desktop
- macOS desktop (not fully verified)

## Deployment

### Web Deployment (Recommended)

The simplest approach, no local tools needed:

1. Fork the [NodeWarden repo](https://github.com/shuaiplus/nodewarden)
2. Go to the [Cloudflare Workers console](https://dash.cloudflare.com) and create a new project
3. Choose Continue with GitHub, point to your forked repo
4. Keep default settings and deploy
5. For KV mode, change the deploy command to `npm run deploy:kv`
6. Set the `JWT_SECRET` environment variable (at least 32 random characters)

The whole process takes under five minutes.

### CLI Deployment

```bash
git clone https://github.com/shuaiplus/NodeWarden.git
cd NodeWarden
npm install
npx wrangler login

# R2 mode
npm run deploy

# KV mode
npm run deploy:kv
```

Local development:

```bash
npm run dev      # R2 mode
npm run dev:kv   # KV mode
```

## Automatic Updates

After forking, enable the `Sync upstream` workflow in GitHub Actions. It auto-syncs with upstream daily at 3am. For manual updates, click Sync fork → Update branch on your fork page.

## NodeWarden or Vaultwarden

If you already have a stable VPS, Vaultwarden is more feature-complete with a larger community. Organizations, collections, and login 2FA are all supported.

NodeWarden fits these scenarios:

- **No VPS management**. No server means no maintenance — no uptime worries, no expired SSL certs, no full disks
- **Zero budget**. Cloudflare's free tier is plenty for personal use
- **Solo user**. No need for organizations and permission management
- **Offsite backups**. Built-in WebDAV backup is more convenient than Vaultwarden's approach

The main risk is that your password vault runs on Cloudflare's infrastructure. D1 and Workers are relatively new services. While Cloudflare probably won't shut them down suddenly, free tier limits and terms can change anytime. Regular WebDAV backups are essential.

Also note that NodeWarden hasn't undergone the same level of community security review as Vaultwarden. Password managers are high-sensitivity applications — assess the risk yourself before using it.

## References

- [NodeWarden GitHub Repository](https://github.com/shuaiplus/nodewarden)
- [Vaultwarden — Rust-based Bitwarden-compatible Server](https://github.com/dani-garcia/vaultwarden)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Bitwarden Official Website](https://bitwarden.com/)
