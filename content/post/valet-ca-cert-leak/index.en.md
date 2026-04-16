---
title: 'Laravel Valet Certificate Showing on analytics.google.com? Root Cause and Fix'
description: 'When visiting an external site like analytics.google.com, the browser shows a Laravel Valet self-signed certificate instead of Google''s. A walkthrough of the three causes — dnsmasq leakage, nginx catch-all default server, and browser cert caching — with step-by-step diagnosis and fixes.'
slug: valet-ca-cert-leak
date: '2026-04-15T12:00:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- laravel-valet
- ssl
- nginx
- dnsmasq
- macos
draft: false
---

You open `analytics.google.com` in Chrome and click the certificate — and see this:

```
Subject: myproject.test
Issuer: Laravel Valet CA Self Signed CN
```

That's not Google's certificate. That's your local Laravel Valet CA leaking onto an external site.

This isn't a browser bug or a Google problem — it's your local dev environment intercepting traffic it shouldn't.

## How It Happens

Valet builds a local dev stack out of three components:

1. **dnsmasq**: resolves `*.test` domains to `127.0.0.1`
2. **nginx**: listens on `127.0.0.1`, routes requests to local sites by `server_name`
3. **Valet CA**: signs HTTPS certificates for each `.test` site

In a correct setup, `/etc/resolver/test` scopes only `*.test` lookups to dnsmasq; external domains go through the system DNS. The two never cross paths.

But there are a few failure modes that break this boundary.

### Cause 1: Overly Broad dnsmasq Rules

The correct content of `~/.config/valet/dnsmasq.d/tld-test.conf` is:

```
address=/.test/127.0.0.1
```

If this entry loses its TLD restriction, or if global dnsmasq config has a catch-all `address` rule, dnsmasq starts resolving domains outside `.test` to `127.0.0.1`.

### Cause 2: nginx Default Server Catches External Requests

When nginx gets a request whose `Host` header doesn't match any known `server_name`, it falls through to the **default server block**. Valet's default block doesn't reject unknown hosts — it falls back to the Valet PHP server. nginx picks up the TLS certificate from whatever vhost was loaded last, which happens to be a `.test` Valet cert.

### Cause 3: Browser Cached the Wrong State

Chrome caches HSTS policies and TLS sessions. If even one request to an external domain was answered by Valet's nginx before the DNS issue was fixed, Chrome may cache that connection state and keep presenting the stale cert on every subsequent visit.

### Why analytics.google.com Gets Hit

Google Analytics is a **third-party script** embedded in local pages. Your local `.test` site loads it; the browser tries to resolve `analytics.google.com`; if dnsmasq is misbehaving at that moment, it returns `127.0.0.1`; nginx gets the request, finds no matching server block, and responds with whichever Valet cert it has handy.

## Diagnosis

**Step 1 — Check if dnsmasq is intercepting external domains**

```bash
dig analytics.google.com @127.0.0.1
```

Expected: `SERVFAIL` or a real Google IP.  
Problem: `127.0.0.1` → dnsmasq is leaking. Keep going.

**Step 2 — Verify dnsmasq rules are scoped to .test only**

```bash
cat ~/.config/valet/dnsmasq.d/tld-test.conf
```

Should only contain:

```
address=/.test/127.0.0.1
listen-address=127.0.0.1
```

**Step 3 — Check /etc/resolver/ for extra files**

```bash
ls /etc/resolver/
```

Only your TLD name (e.g. `test`) should be here. No blank filename, no wildcard.

**Step 4 — Check nginx default server behavior**

```bash
nginx -T 2>/dev/null | grep -A 5 "default_server"
```

If the default server doesn't have `return 444` or `return 400`, unknown hosts fall through to a real vhost.

## Fixes

### Fix 1: Clear Browser HSTS and Socket Cache

The most common case — even after the underlying DNS is fixed, stale cache keeps the bad cert appearing.

**Chrome**:
1. Go to `chrome://net-internals/#hsts`
2. Under "Delete domain security policies", type `analytics.google.com` → Delete
3. Go to `chrome://net-internals/#sockets` → **Flush socket pools**

**Safari**:
Preferences → Privacy → Manage Website Data → search the affected domain → Remove

### Fix 2: Flush System DNS Cache

```bash
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

### Fix 3: Add an nginx Default Server That Rejects Unknown Hosts

Adding an explicit catch-all that drops connections prevents any accidental bleed-through from reaching a `.test` vhost:

Find the Valet nginx config directory:

```bash
ls /opt/homebrew/etc/nginx/valet/
```

Add `_reject-default.conf`:

```nginx
server {
    listen 127.0.0.1:80 default_server;
    listen 127.0.0.1:443 ssl default_server;
    server_name _;

    ssl_certificate /dev/null;
    ssl_certificate_key /dev/null;

    return 444;
}
```

`444` is nginx's connection-close-with-no-response code — the client gets nothing back, the request dies silently.

Apply:

```bash
valet restart
```

### Fix 4: Rebuild Valet CA Trust (if the Keychain state is broken)

```bash
valet trust       # re-add Valet CA to system trust
```

Or re-issue certs for your sites:

```bash
valet unsecure --all
valet secure <site-name>
```

## Verify the Fix

```bash
# Confirm external domains are no longer intercepted
dig analytics.google.com @127.0.0.1
# Expected: SERVFAIL or a real IP, not 127.0.0.1

# Confirm nginx rejects unknown hosts
curl -I --resolve analytics.google.com:443:127.0.0.1 https://analytics.google.com 2>&1 | head -5
# Expected: connection refused or SSL handshake failure — not a Valet cert
```

Then open Chrome, visit `analytics.google.com`, click the certificate icon — issuer should be Google, not Laravel Valet CA.

## Prevention

- **Don't touch dnsmasq global config** — Valet's dnsmasq rules should only cover your configured TLD
- **After `valet install` or major upgrades**, re-verify dnsmasq rules haven't been broadened
- **Add the nginx default reject block** once and forget about it — any stray traffic gets dropped at the nginx layer before it can serve the wrong cert
- **Avoid embedding external analytics scripts in local `.test` pages** during development — reduces the surface area where dnsmasq leakage can trigger

## References

- [Laravel Valet Documentation](https://laravel.com/docs/valet)
- [dnsmasq Documentation](https://thekelleys.org.uk/dnsmasq/doc.html)
- [Chrome net-internals](chrome://net-internals/)
- [nginx return 444](https://nginx.org/en/docs/http/ngx_http_rewrite_module.html#return)
