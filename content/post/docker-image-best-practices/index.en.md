---
title: 'Docker Image Diet: Find the Problem With dive Before Trying to Fix It'
date: '2026-03-29T09:00:00+08:00'
slug: docker-image-best-practices
image: featured.jpg
description: "Don't guess why your Docker image is large — use docker image history and dive to see exactly where the weight is. Fix what's actually broken. A real 1.25GB → 139MB walkthrough."
categories:
  - DevOps
tags:
  - docker
  - dockerfile
  - devops
  - dive
  - optimization
  - container
  - multi-stage
---

Your Docker image is large and you don't know why.
Guessing and applying a checklist of tips might not cut much.
Find out what's actually causing the size, then fix that specifically.

## The Tools: docker image history + dive

Two tools, different purposes.

**`docker image history`** is built into Docker. It shows how much space each layer takes:

```bash
docker image history <image-name>
```

**`dive`** is a third-party tool. It lets you browse each layer's contents interactively and reports how much space is being wasted:

```bash
# Install
brew install dive          # macOS
apt install dive           # Ubuntu (requires adding repo first)

# Analyze interactively
dive <image-name>

# CI mode (report only, no interactive UI)
CI=true dive <image-name>
```

## Starting With a Fat Image

A typical Node.js Dockerfile with no optimizations:

```dockerfile
FROM node:latest

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]
```

`package.json` has a few devDependencies: jest, typescript, @types/express.

After `docker build`, `docker images` shows:

```
REPOSITORY   TAG       IMAGE ID       SIZE
demo-app     latest    ddb21d14ccef   1.25GB
```

1.25GB. Don't touch the Dockerfile yet — find out where the weight is.

## Step 1: docker image history

```bash
docker image history demo-app
```

Output (relevant lines):

```
CREATED BY                                          SIZE
CMD ["node" "index.js"]                             0B
COPY . .                                            49.3MB
RUN npm install                                     61MB
COPY package*.json ./                               166kB
WORKDIR /app                                        0B
RUN ... (node binary install)                       199MB
RUN ... (apt-get build-essential etc.)              561MB
RUN ... (apt-get base packages)                     184MB
# debian bookworm base                              139MB
```

Three things stand out immediately:

1. **561MB apt-get layer**: `build-essential`, `python3`, `gcc` — build tools that aren't needed at runtime, but they're stuck in the image
2. **61MB npm install**: includes devDependencies (jest, typescript) that production doesn't use
3. **49.3MB COPY . .**: `node_modules` got copied in (no `.dockerignore`)

## Step 2: dive to Find the Waste

`docker image history` shows layer sizes. `dive` shows what's actually inside each layer:

```bash
CI=true dive demo-app
```

Output:

```
efficiency: 95.49 %
wastedBytes: 107 MB
userWastedPercent: 9.68 %

Inefficient Files:
Count  Wasted Space  File Path
    2       18 MB    /app/node_modules/typescript/lib/typescript.js
    2       12 MB    /app/node_modules/typescript/lib/_tsc.js
    2      3.7 MB    /app/node_modules/typescript/lib/lib.dom.d.ts
    2      2.9 MB    /app/node_modules/@babel/parser/lib/index.js.map
    ...
```

**107MB wasted.** dive names the culprits directly: `typescript`, `@babel/parser` — all devDependencies that serve no purpose in a production image.

"Count: 2" means the same file appears in two layers — once from `npm install`, once from `COPY . .`. That's what happens without a `.dockerignore`: `node_modules` gets installed, then copied in again on top.

## Fix What's Actually Broken

Problems identified. Fix each one:

**Problem 1: node_modules copied twice**
→ Add `.dockerignore`

```dockerignore
node_modules
.git
.env
*.log
```

**Problem 2: devDependencies in production image**
→ Multi-stage build, production stage uses `--omit=dev`

**Problem 3: Base image is too heavy (Debian + build tools)**
→ Switch to `node:20-alpine`

The fixed Dockerfile:

```dockerfile
# Stage 1: install everything (including devDeps for build)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# If you have TypeScript: RUN npm run build

# Stage 2: production dependencies only
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev        # no jest, no typescript
COPY --from=builder /app/index.js ./
CMD ["node", "index.js"]
```

Rebuild and compare:

```bash
docker build -t demo-app-fixed .
docker images | grep demo
```

```
REPOSITORY       SIZE
demo-app-fixed   139MB    ← down from 1.25GB
demo-app         1.25GB
```

Run dive again to confirm:

```
efficiency: 99.96 %
wastedBytes: 75 kB    ← down from 107MB
```

## Can You Go Further?

The 139MB floor is mostly the Node.js runtime inside `node:20-alpine`. To go lower, switch to distroless:

```dockerfile
FROM gcr.io/distroless/nodejs20-debian12 AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/index.js ./
CMD ["index.js"]
```

That gets you to around 100MB. Beyond that, the gains are small — unless you switch to Go.

## Go: A Different Story

Go compiles to a static binary. Use `scratch` — a completely empty base image:

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM scratch
COPY --from=builder /app/server /server
ENTRYPOINT ["/server"]
```

Final image is just the binary. A few MB to a few dozen MB. At this point dive has little to tell you — there's almost nothing to optimize.

## Summary

**Workflow**: `docker image history` to find the heavy layers → `dive` to see what's inside them → fix the actual problem.

The common culprits:

- **Bloated base image**: `node:latest` (Debian) → `node:20-alpine`
- **devDependencies in production**: multi-stage build + `--omit=dev`
- **Duplicate node_modules**: add `.dockerignore`

Use tools to diagnose, make targeted fixes, then verify with tools again. More effective than guessing.

## References

- [dive on GitHub — Docker image layer explorer](https://github.com/wagoodman/dive)
- [Docker Docs — Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Docs — .dockerignore file](https://docs.docker.com/reference/dockerfile/#dockerignore-file)
- [GoogleContainerTools Distroless images](https://github.com/GoogleContainerTools/distroless)
- [Docker Docs — docker image history](https://docs.docker.com/reference/cli/docker/image/history/)

