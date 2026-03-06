---
title: 'Docker Image 瘦身：先用 dive 找出問題，再對症下藥'
date: '2026-03-29T09:00:00+08:00'
slug: docker-image-best-practices
description: '不要猜 Docker image 為什麼大，用 docker image history 和 dive 直接看。找到問題之後針對性修，比套用技巧清單更有效率。從 1.25GB 壓到 139MB 的實際過程。'
categories:
  - DevOps
tags:
  - docker
  - dockerfile
  - devops
  - dive
  - optimization
---

Docker image 大，通常你不知道大在哪裡。
亂猜然後套技巧清單，改了半天可能砍不到多少。
先用工具找出問題在哪，再針對性修，才是有效率的做法。

## 工具：docker image history + dive

兩個工具，各有用途。

**`docker image history`** 是 Docker 內建的，看每個 layer 佔多少空間：

```bash
docker image history <image-name>
```

**`dive`** 是第三方工具，互動式瀏覽每個 layer 的內容，還會分析浪費了多少空間：

```bash
# 安裝
brew install dive          # macOS
apt install dive           # Ubuntu（需先加 repo）

# 分析
dive <image-name>

# CI 模式（只輸出報告，不開互動界面）
CI=true dive <image-name>
```

## 從一個肥 Image 開始

一個典型的 Node.js Dockerfile，什麼優化都沒做：

```dockerfile
FROM node:latest

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]
```

`package.json` 裡有幾個 devDependencies（jest、typescript、@types/express）。

`docker build` 完，`docker images` 一看：

```
REPOSITORY   TAG       IMAGE ID       SIZE
demo-app     latest    ddb21d14ccef   1.25GB
```

1.25GB。先別動 Dockerfile，看看問題在哪。

## 第一步：docker image history

```bash
docker image history demo-app
```

輸出（節錄重要的部分）：

```
CREATED BY                                          SIZE
CMD ["node" "index.js"]                             0B
COPY . .                                            49.3MB
RUN npm install                                     61MB
COPY package*.json ./                               166kB
WORKDIR /app                                        0B
RUN ... (node binary 安裝)                          199MB
RUN ... (apt-get build-essential 等工具)            561MB
RUN ... (apt-get base packages)                     184MB
# debian bookworm base                              139MB
```

幾個地方一眼就看出問題：

1. **561MB 的 apt-get 那層**：`build-essential`、`python3`、`gcc` 這些 build 工具，build 完就用不到了，但還留在 image 裡
2. **61MB 的 npm install**：裝了 devDependencies（jest、typescript），production 根本用不到
3. **49.3MB 的 COPY . .**：node_modules 被 COPY 進去了（沒有 `.dockerignore`）

## 第二步：dive 找浪費

`docker image history` 看 layer 大小，`dive` 看 layer 裡面實際有哪些檔案：

```bash
CI=true dive demo-app
```

輸出：

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

**107MB 浪費**，而且 dive 直接指出元凶：`typescript`、`@babel/parser`——全是 devDependencies，在 production image 裡根本不需要。

「Count: 2」代表同一個檔案出現在兩個 layer 裡，一次在 `npm install` layer，一次在 `COPY . .` layer，重複了。這就是沒有 `.dockerignore` 的後果：`node_modules` 被 install 了一次，又被 COPY 進去一次。

## 對症下藥

找到問題了，針對性修：

**問題 1：node_modules 被 COPY 兩次**
→ 加 `.dockerignore`

```dockerignore
node_modules
.git
.env
*.log
```

**問題 2：devDependencies 進了 production image**
→ multi-stage build，production stage 只裝 `--omit=dev`

**問題 3：base image 太肥（Debian + build tools）**
→ 換 `node:20-alpine`

修完的 Dockerfile：

```dockerfile
# Stage 1：安裝所有依賴（含 devDependencies，用於 build）
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# 如果有 TypeScript：RUN npm run build

# Stage 2：只裝 production 需要的
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev        # 不裝 jest、typescript 等
COPY --from=builder /app/index.js ./
CMD ["node", "index.js"]
```

重新 build：

```bash
docker build -t demo-app-fixed .
docker images | grep demo
```

```
REPOSITORY       SIZE
demo-app-fixed   139MB    ← 從 1.25GB 下來了
demo-app         1.25GB
```

再跑一次 dive 確認：

```
efficiency: 99.96 %
wastedBytes: 75 kB    ← 從 107MB 變成 75KB
```

## 還能更小嗎

139MB 的瓶頸是 `node:20-alpine` 本身（Node.js runtime 約 100MB）。如果想繼續壓，可以換成 distroless：

```dockerfile
FROM gcr.io/distroless/nodejs20-debian12 AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/index.js ./
CMD ["index.js"]
```

大約能到 100MB。再往下的空間不大，除非換語言（Go + scratch 可以到幾 MB）。

## Go 的情況

Go 可以編成 static binary，直接用空的 `scratch` image：

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM scratch
COPY --from=builder /app/server /server
ENTRYPOINT ["/server"]
```

最終 image 只有 binary，幾 MB 到幾十 MB。dive 的意義在這裡就小了，因為沒什麼可以優化的。

## 小結

**流程**：`docker image history` 看哪層最重 → `dive` 看那層裡有什麼廢物 → 針對性修

常見的問題集中在三個地方：

- **base image 太肥**：`node:latest`（Debian）換成 `node:20-alpine`
- **devDependencies 進了 production**：multi-stage build + `--omit=dev`
- **node_modules 重複**：加 `.dockerignore`

用工具確認問題，改完再用工具驗收，比憑感覺猜有效率多了。
