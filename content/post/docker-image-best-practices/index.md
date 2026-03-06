---
title: 'Docker Image 最佳實踐：從 1.2GB 壓到 10MB 的九個方法'
date: '2026-03-29T09:00:00+08:00'
slug: docker-image-best-practices
description: 'Docker image 太大拖慢 CI/CD、增加攻擊面。從選對 base image、multi-stage build、layer 快取順序、.dockerignore，到 distroless，九個技巧把 Node.js image 從 1.2GB 壓到 10MB。'
categories:
  - DevOps
tags:
  - docker
  - dockerfile
  - devops
  - ci-cd
  - optimization
---

`docker build` 跑完，`docker images` 一看：1.2GB。
Pull 一次要幾分鐘，CI/CD 每次 deploy 都在等，production server 硬碟也吃不消。
從選 base image 到 multi-stage build，一步一步把它壓下來。

## 從哪裡來的 1.2GB

先看問題在哪。一個典型的 Node.js Dockerfile，新手版本：

```dockerfile
FROM node:latest

WORKDIR /app
COPY . .
RUN npm install

CMD ["node", "server.js"]
```

`node:latest` 基於 Debian，解壓後超過 1GB，加上 `node_modules`（含 devDependencies）輕鬆破 1.2GB。

下面逐步拆解怎麼解決。

---

## 1. 換掉 base image

`node:latest` 是 full Debian，帶了幾百個你用不到的工具。

```dockerfile
# 1.2GB → ~300MB
FROM node:20-alpine
```

Alpine Linux 只有 5MB，`node:20-alpine` 大約 180MB。改這一行就砍掉 70%。

再進一步，選 slim 版：

```dockerfile
FROM node:20-slim   # Debian 瘦身版，~250MB，比 Alpine 相容性好
```

Alpine 偶爾跟某些 native addon 不相容（musl vs glibc），遇到問題再換 slim 就好。

不要用 `latest`，永遠指定版本：

```dockerfile
FROM node:20-alpine   # ✓ 明確版本
FROM node:latest      # ✗ 不可預期
```

---

## 2. Multi-stage build：把 build 工具留在 build stage

最大的突破。Build 需要的東西（TypeScript compiler、test runner、devDependencies）不應該進 production image。

```dockerfile
# ── Stage 1：Build ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 先複製 package.json，利用 layer 快取
COPY package*.json ./
RUN npm ci                    # 含 devDependencies

COPY . .
RUN npm run build             # TypeScript 編譯

# ── Stage 2：Production ─────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev         # 只裝 dependencies，不裝 devDependencies

# 只複製編譯好的 dist，不複製 src
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/server.js"]
```

`--from=builder` 把 builder stage 的產物複製過來，其他東西（TypeScript、jest、src/）完全不會進 production image。

---

## 3. .dockerignore：別把垃圾送進去

沒有 `.dockerignore`，`COPY . .` 會把所有東西送進 build context，包括 `node_modules`、`.git`、測試資料。

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

`.dockerignore` 影響兩件事：build context 大小（傳給 Docker daemon 的資料量）和 COPY 進去的內容。

---

## 4. Layer 快取：順序很重要

Docker 每個指令都是一個 layer，layer 沒變就從快取讀。`COPY . .` 會讓整個 src 的任何改動都使後面的 layer 失效。

```dockerfile
# ✗ 壞的順序：改任何 src 都讓 npm install 重跑
COPY . .
RUN npm ci

# ✓ 好的順序：package.json 沒變就直接用快取
COPY package*.json ./
RUN npm ci
COPY . .
```

把「不常變」的指令放前面，「常變」的放後面。`package.json` 通常比 src 穩定，分開 COPY 讓 npm install 有快取可用。

---

## 5. 合併 RUN 指令，安裝完立刻清

每個 `RUN` 都是一個 layer。在 layer 裡裝了東西，即使下一個 layer 刪掉，前一個 layer 還是存在於 image 裡。

```dockerfile
# ✗ 錯誤：apt cache 雖然刪了，但它佔的空間還在前一個 layer
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# ✓ 正確：同一個 layer 裝完就清
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
```

`--no-install-recommends` 避免裝推薦但用不到的套件。

---

## 6. npm ci 而不是 npm install

```dockerfile
RUN npm ci --omit=dev
```

`npm ci` 從 `package-lock.json` 安裝，版本鎖定，速度更快，適合 CI/CD。`npm install` 會更新 lock file，不適合 build。

`--omit=dev` 跳過 devDependencies，這些不應該進 production。

---

## 7. 換成 distroless：極致瘦身

[distroless](https://github.com/GoogleContainerTools/distroless) 是 Google 維護的 image，只有 runtime，沒有 shell、沒有 package manager、沒有任何多餘的東西。

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# distroless Node.js image，約 100MB
FROM gcr.io/distroless/nodejs20-debian12

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["dist/server.js"]
```

注意：distroless 沒有 shell，`CMD` 不能用 string 形式，要用 array：

```dockerfile
CMD ["dist/server.js"]   # ✓
CMD "node dist/server.js" # ✗ 找不到 shell
```

| Base image | 大小 |
|---|---|
| node:20 | ~1.1GB |
| node:20-slim | ~250MB |
| node:20-alpine | ~180MB |
| distroless/nodejs20 | ~100MB |

---

## 8. 用非 root 使用者執行

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY --chown=node:node . .

# node:alpine 內建 node user
USER node

CMD ["node", "server.js"]
```

root 執行 container 是安全風險，萬一應用程式被攻破，攻擊者拿到 root。大部分官方 image 都內建非 root user，用就對了。

---

## 9. Go / Python 的做法

**Go：最適合 multi-stage**

Go 可以編譯成 static binary，直接用 `scratch`（完全空的 image）：

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# scratch = 0 bytes base image
FROM scratch
COPY --from=builder /app/server /server
ENTRYPOINT ["/server"]
```

最終 image 只有 binary 本身，幾 MB 到幾十 MB，視 binary 大小而定。

**Python：用 slim + 虛擬環境**

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

## 效果對比

從最原始到最優化的 Node.js image：

| 版本 | 大小 | 手法 |
|---|---|---|
| `node:latest` + 所有依賴 | ~1.2GB | 什麼都沒做 |
| `node:20-alpine` | ~350MB | 換 base image |
| `node:20-alpine` + multi-stage | ~180MB | 去掉 devDependencies 和 src |
| distroless + multi-stage | ~110MB | 換 runtime image |
| Go scratch build | ~10MB | 靜態 binary |

---

## 快速清單

- [ ] 換 `node:X-alpine` 或 `node:X-slim`，不用 `latest`
- [ ] `.dockerignore` 排除 `node_modules`、`.git`、`.env`
- [ ] `package*.json` 先 COPY，再 `npm ci`，再 COPY src
- [ ] Multi-stage build，production stage 只裝 `--omit=dev`
- [ ] `RUN` 指令合併，apt cache 同一層清掉
- [ ] `USER node` 或 `USER nobody` 非 root 執行
- [ ] 考慮 distroless（Node、Python、Java）或 scratch（Go）

不需要一次全部做，先換 base image 和加 `.dockerignore`，image 就能砍掉一半以上。
