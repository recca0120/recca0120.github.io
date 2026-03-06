---
title: 'Docker Image Best Practices: From 1.2GB to 10MB in Nine Steps'
date: '2026-03-29T09:00:00+08:00'
slug: docker-image-best-practices
description: 'Large Docker images slow down CI/CD and increase attack surface. Nine techniques — base image selection, multi-stage builds, layer cache ordering, .dockerignore, distroless — to shrink a Node.js image from 1.2GB to 10MB.'
categories:
  - DevOps
tags:
  - docker
  - dockerfile
  - devops
  - ci-cd
  - optimization
---

`docker build` finishes. `docker images` shows 1.2GB.
Every CI/CD deploy waits minutes for a pull. Production servers fill up.
Here's how to fix it, step by step.

## Where Does 1.2GB Come From

A typical Node.js Dockerfile written by someone new to Docker:

```dockerfile
FROM node:latest

WORKDIR /app
COPY . .
RUN npm install

CMD ["node", "server.js"]
```

`node:latest` is based on full Debian — over 1GB decompressed. Add `node_modules` including devDependencies and 1.2GB is easy to hit.

Here's how to tear it down.

---

## 1. Switch the Base Image

`node:latest` carries hundreds of tools you'll never use.

```dockerfile
# 1.2GB → ~300MB
FROM node:20-alpine
```

Alpine Linux is 5MB. `node:20-alpine` comes in around 180MB. One line change, 70% gone.

Or use the slim variant:

```dockerfile
FROM node:20-slim   # Trimmed Debian, ~250MB, better compatibility than Alpine
```

Alpine occasionally breaks native addons (musl vs glibc). If you hit issues, switch to slim.

Never use `latest` — pin a version:

```dockerfile
FROM node:20-alpine   # ✓ predictable
FROM node:latest      # ✗ unpredictable
```

---

## 2. Multi-Stage Builds: Leave Build Tools Behind

The biggest win. Build tools — TypeScript compiler, test runner, devDependencies — should never enter the production image.

```dockerfile
# ── Stage 1: Build ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json first to leverage layer caching
COPY package*.json ./
RUN npm ci                    # includes devDependencies

COPY . .
RUN npm run build             # compile TypeScript

# ── Stage 2: Production ─────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev         # production dependencies only

# Copy only compiled output, not src
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/server.js"]
```

`--from=builder` pulls only what you specify from the build stage. TypeScript, jest, `src/` — none of it enters the production image.

---

## 3. .dockerignore: Stop Sending Garbage

Without `.dockerignore`, `COPY . .` sends everything to the Docker build context — including `node_modules`, `.git`, test fixtures.

```dockerignore
# .dockerignore
node_modules
.git
.gitignore
*.md
.env
.env.*
dist
coverage
.nyc_output
Dockerfile
.dockerignore
*.log
.DS_Store
```

`.dockerignore` affects two things: the size of the build context sent to the Docker daemon, and what `COPY` brings in.

---

## 4. Layer Cache Order Matters

Every Dockerfile instruction creates a layer. If a layer hasn't changed, Docker uses the cache. `COPY . .` before `npm install` means any source file change invalidates the install layer.

```dockerfile
# ✗ Any src change re-runs npm install
COPY . .
RUN npm ci

# ✓ npm install only re-runs when package.json changes
COPY package*.json ./
RUN npm ci
COPY . .
```

Put stable things first, volatile things last. `package.json` changes far less often than source files.

---

## 5. Combine RUN Instructions, Clean in the Same Layer

Each `RUN` is a layer. Even if a later layer deletes files, the earlier layer still exists in the image and contributes to the size.

```dockerfile
# ✗ Cache is still in the previous layer even though deleted
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# ✓ Install and clean in one layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
```

`--no-install-recommends` skips packages recommended but not required.

---

## 6. npm ci Instead of npm install

```dockerfile
RUN npm ci --omit=dev
```

`npm ci` installs from `package-lock.json` exactly — locked versions, faster, no lock file mutation. `npm install` can update the lock file, which is wrong in a build environment.

`--omit=dev` skips devDependencies. They don't belong in production.

---

## 7. Distroless: The Next Level

[distroless](https://github.com/GoogleContainerTools/distroless) images from Google contain only the runtime — no shell, no package manager, nothing extra.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# distroless Node.js image, ~100MB
FROM gcr.io/distroless/nodejs20-debian12

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["dist/server.js"]
```

No shell means CMD must use array form:

```dockerfile
CMD ["dist/server.js"]    # ✓
CMD "node dist/server.js" # ✗ no shell to parse this
```

| Base image | Size |
|---|---|
| node:20 | ~1.1GB |
| node:20-slim | ~250MB |
| node:20-alpine | ~180MB |
| distroless/nodejs20 | ~100MB |

---

## 8. Run as Non-Root

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY --chown=node:node . .

# node:alpine ships with a built-in node user
USER node

CMD ["node", "server.js"]
```

Running as root inside a container is a security risk. If the application is compromised, the attacker gets root. Most official images ship a non-root user — use it.

---

## 9. Go and Python

**Go: best case for multi-stage**

Go compiles to static binaries. Use `scratch` — a completely empty image:

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# scratch = 0 byte base image
FROM scratch
COPY --from=builder /app/server /server
ENTRYPOINT ["/server"]
```

Final image is just the binary. A few MB to a few dozen MB depending on binary size.

**Python: slim + clean install**

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
USER nobody
CMD ["python", "app.py"]
```

---

## Results

| Version | Size | Technique |
|---|---|---|
| `node:latest` + everything | ~1.2GB | nothing |
| `node:20-alpine` | ~350MB | switch base image |
| `node:20-alpine` + multi-stage | ~180MB | remove devDeps and src |
| distroless + multi-stage | ~110MB | switch runtime image |
| Go scratch build | ~10MB | static binary |

---

## Checklist

- [ ] Use `node:X-alpine` or `node:X-slim`, never `latest`
- [ ] `.dockerignore` excludes `node_modules`, `.git`, `.env`
- [ ] Copy `package*.json` first, then `npm ci`, then copy src
- [ ] Multi-stage build, production stage uses `--omit=dev`
- [ ] Combine `RUN` instructions, clean apt cache in the same layer
- [ ] `USER node` or `USER nobody` — don't run as root
- [ ] Consider distroless (Node, Python, Java) or scratch (Go)

You don't need to do all of these at once. Switching the base image and adding `.dockerignore` alone cuts most images in half.
