---
title: 'Terraform 入門：用程式碼管理雲端基礎設施，告別手動點擊'
date: '2026-03-14T09:00:00+08:00'
slug: terraform-infrastructure-as-code
description: 'Terraform 是 Infrastructure as Code 工具，用 HCL 宣告式語言管理 AWS、GCP、Cloudflare 等 3000+ provider。本文涵蓋安裝、HCL 語法、state 管理、module 架構、多環境策略與實際部署靜態網站範例。'
categories:
  - DevOps
tags:
  - terraform
  - infrastructure-as-code
  - aws
  - devops
  - cloudflare
---

每次部署新環境，要在 console 一個一個點設定。三個月後同事問你怎麼建的，你自己也忘了。
staging 和 prod 的設定悄悄分歧，直到出事才發現。
[Terraform](https://www.terraform.io/) 把這些用程式碼描述，`plan` 看變更，`apply` 執行，有 git 紀錄，可以 review，可以 rollback。

## 安裝

用 [tfenv](https://github.com/tfutils/tfenv) 管理版本，跟 nvm 的概念一樣：

```bash
# macOS
brew install tfenv

# 安裝並切換到指定版本
tfenv install 1.10.5
tfenv use 1.10.5

# 在專案根目錄建立版本鎖定檔，cd 進來會自動切換
echo "1.10.5" > .terraform-version
```

不想管版本的話，直接用 Homebrew：

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform --version
```

## HCL 基本語法

Terraform 用 HCL（HashiCorp Configuration Language）寫設定，副檔名 `.tf`，宣告式語法，描述「要什麼」而不是「怎麼做」。

### Resource：建立雲端資源

```hcl
# 格式：resource "provider_type" "本地名稱" { ... }
resource "aws_s3_bucket" "website" {
  bucket = "my-website-2026"

  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# 引用其他 resource 的屬性，會自動建立依賴關係
resource "aws_s3_bucket_versioning" "website" {
  bucket = aws_s3_bucket.website.id  # 格式：type.name.attribute

  versioning_configuration {
    status = "Enabled"
  }
}
```

### Variable：輸入參數

```hcl
variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "必須是 dev、staging 或 prod。"
  }
}

variable "instance_count" {
  type    = number
  default = 1
}

variable "db_password" {
  type      = string
  sensitive = true  # 不會出現在 CLI 輸出和 log
}
```

傳入值的方式（優先順序由高到低）：

```bash
# 1. CLI 參數
terraform apply -var="environment=prod"

# 2. var 檔案
terraform apply -var-file="prod.tfvars"

# 3. terraform.tfvars（自動讀取）
# 4. 環境變數
export TF_VAR_environment=prod

# 5. variable 的 default 值
```

`terraform.tfvars` 範例：

```hcl
environment    = "prod"
instance_count = 3
```

### Output：輸出值

```hcl
output "bucket_name" {
  value       = aws_s3_bucket.website.id
  description = "S3 bucket 名稱"
}

output "bucket_arn" {
  value = aws_s3_bucket.website.arn
}
```

```bash
terraform output bucket_name  # 查看單一輸出
terraform output              # 查看全部
```

### Locals：本地計算值

Locals 是在設定內部重複使用的計算值，不是使用者輸入：

```hcl
locals {
  bucket_name   = "${var.environment}-${var.project}-assets"
  instance_type = var.environment == "prod" ? "t3.large" : "t3.micro"

  common_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket" "assets" {
  bucket = local.bucket_name   # 用 local.名稱 引用
  tags   = local.common_tags
}
```

### Data Source：讀取既有資源

Data source 是唯讀查詢，用來讀取不是這個 Terraform 管的資源：

```hcl
# 查最新的 Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

# 用 data.type.name.attribute 引用
resource "aws_instance" "app" {
  ami           = data.aws_ami.amazon_linux.id
  instance_type = "t3.micro"
}
```

## 核心指令流程

```bash
# 初始化：下載 provider 插件，建立 .terraform/ 目錄
terraform init

# 預覽：顯示會做什麼改動，不實際執行
# + 建立  - 刪除  ~ 更新  +/- 砍掉重建
terraform plan

# 執行：套用變更（會要求確認）
terraform apply

# 存計劃檔再執行（CI/CD 常用）
terraform plan -out=tfplan
terraform apply tfplan

# 自動確認（CI/CD pipeline）
terraform apply -auto-approve

# 其他常用指令
terraform fmt           # 格式化所有 .tf 檔
terraform validate      # 檢查語法
terraform state list    # 列出 state 中的所有資源
terraform destroy       # 刪除所有資源
```

## Provider 設定

Provider 是連接各雲端平台的插件，宣告方式：

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"  # >= 5.80, < 6.0
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"
  # 憑證從環境變數讀取：AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
```

CloudFront 需要憑證在 us-east-1，可以用 provider alias：

```hcl
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_acm_certificate" "cert" {
  provider          = aws.us_east_1  # 指定 alias
  domain_name       = "example.com"
  validation_method = "DNS"
}
```

## State 管理

Terraform 用 `terraform.tfstate` 記錄它建立了哪些資源、資源的 ID 和屬性。這個檔案是 Terraform 運作的核心。

**重要：state 裡可能有明文密碼和 private key，絕對不能 commit 到 git。**

```gitignore
# .gitignore
*.tfstate
*.tfstate.backup
.terraform/
terraform.tfvars

# 這個要 commit：鎖定 provider 版本
# .terraform.lock.hcl
```

### Remote State（團隊必要）

本地 state 沒辦法多人協作。要把 state 放到 S3：

```hcl
# 先建立 S3 bucket 存放 state
resource "aws_s3_bucket" "tf_state" {
  bucket = "my-company-terraform-state"
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"  # 保留 state 歷史版本，方便回滾
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

設定 backend 使用這個 bucket：

```hcl
terraform {
  backend "s3" {
    bucket       = "my-company-terraform-state"
    key          = "prod/web-app/terraform.tfstate"  # bucket 內的路徑
    region       = "ap-northeast-1"
    use_lockfile = true  # Terraform 1.10+ S3 原生 locking，不再需要 DynamoDB
  }
}
```

`use_lockfile = true` 是 Terraform 1.10 加入的功能，用 S3 條件寫入做 locking，防止兩個人同時 apply 導致 state 損壞。以前要額外建 DynamoDB table，現在不需要了。

## Module：可重用的設定單元

Module 是 Terraform 的打包機制，把重複的資源定義包起來，讓不同環境共用。

### 標準目錄結構

```
modules/
  s3-website/
    main.tf       # 資源定義
    variables.tf  # 輸入參數
    outputs.tf    # 輸出值
    versions.tf   # provider 版本

environments/
  dev/
    main.tf       # 呼叫 module，用 dev 的參數
    backend.tf
    terraform.tfvars
  prod/
    main.tf
    backend.tf
    terraform.tfvars
```

### 寫一個 Module

```hcl
# modules/s3-website/variables.tf
variable "bucket_name" {
  type = string
}

variable "environment" {
  type = string
}
```

```hcl
# modules/s3-website/main.tf
resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = "Enabled"
  }
}
```

```hcl
# modules/s3-website/outputs.tf
output "bucket_id" {
  value = aws_s3_bucket.this.id
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}
```

### 呼叫 Module

```hcl
# environments/prod/main.tf
module "website" {
  source = "../../modules/s3-website"  # 本地路徑

  bucket_name = "my-company-website-prod"
  environment = "prod"
}

# 讀取 module 的輸出值
output "website_bucket" {
  value = module.website.bucket_id
}
```

也可以用 Terraform Registry 上的公開 module：

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "main-vpc"
  cidr = "10.0.0.0/16"
  azs  = ["ap-northeast-1a", "ap-northeast-1c"]
}
```

## 多環境策略

有兩種常見做法：

**Workspaces**：同一份設定，不同 state。適合小團隊、環境差異小的情況。

```bash
terraform workspace new dev
terraform workspace new prod
terraform workspace select prod
```

**獨立目錄**（推薦）：每個環境是完全獨立的 Terraform root，有自己的 backend 和 state。適合 prod 需要嚴格存取控制的情況。

```
environments/
  dev/   ← terraform init / plan / apply 在這裡執行
  prod/  ← 獨立的 state、獨立的權限
```

## 實際範例：S3 + CloudFront 靜態網站

這個範例部署一個私有 S3 bucket 搭配 CloudFront，用 OAC（Origin Access Control）讓 CloudFront 讀取 S3 內容。

```hcl
# versions.tf
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }

  backend "s3" {
    bucket       = "my-company-tf-state"
    key          = "s3-website/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-northeast-1"
}

# CloudFront + ACM 憑證必須在 us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
```

```hcl
# main.tf
locals {
  common_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── S3 Bucket（私有，只讓 CloudFront 存取）──
resource "aws_s3_bucket" "website" {
  bucket = var.bucket_name
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "website" {
  bucket                  = aws_s3_bucket.website.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── CloudFront OAC（取代舊的 OAI）──
resource "aws_cloudfront_origin_access_control" "website" {
  name                              = "${var.bucket_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Bucket Policy：只允許 CloudFront 讀取 ──
data "aws_iam_policy_document" "website" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.website.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.website.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "website" {
  bucket     = aws_s3_bucket.website.id
  policy     = data.aws_iam_policy_document.website.json
  depends_on = [aws_s3_bucket_public_access_block.website]
}

# ── ACM 憑證（us-east-1）──
resource "aws_acm_certificate" "website" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"
  tags              = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# ── CloudFront Distribution ──
resource "aws_cloudfront_distribution" "website" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"  # US + 歐洲，省成本
  aliases             = [var.domain_name]
  tags                = local.common_tags

  origin {
    domain_name              = aws_s3_bucket.website.bucket_regional_domain_name
    origin_id                = "S3-${var.bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.website.id
  }

  default_cache_behavior {
    target_origin_id       = "S3-${var.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    default_ttl = 86400    # 1 天
    max_ttl     = 31536000 # 1 年
  }

  # SPA：404/403 都回傳 index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.website.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
}
```

```hcl
# outputs.tf
output "cloudfront_domain" {
  value = aws_cloudfront_distribution.website.domain_name
}

output "cloudfront_id" {
  value = aws_cloudfront_distribution.website.id
}

output "bucket_name" {
  value = aws_s3_bucket.website.id
}
```

部署和上傳：

```bash
terraform init
terraform plan
terraform apply

# 上傳靜態檔案
aws s3 sync ./dist s3://$(terraform output -raw bucket_name) --delete

# 清除 CloudFront 快取
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw cloudfront_id) \
  --paths "/*"
```

## 常見陷阱

**State 含敏感資料**：state 裡存著 resource 的所有屬性，包括明文密碼。`sensitive = true` 只是不顯示在 CLI，值還是寫進 state。用 remote backend 加密儲存，不要用 local state 存 prod 環境。

**Config drift**：有人在 console 手動改了，Terraform 不知道。用 `terraform plan -refresh-only` 偵測差異，不會動到實際資源。

**匯入既有資源**：已經存在的資源要讓 Terraform 管理，用 import block（Terraform 1.5+）：

```hcl
import {
  to = aws_s3_bucket.legacy
  id = "my-existing-bucket-name"
}
```

然後 `terraform plan -generate-config-out=generated.tf` 自動產出 resource block，review 後 `terraform apply`。

**lifecycle 保護**：關鍵資源加 `prevent_destroy`，防止意外刪除：

```hcl
resource "aws_s3_bucket" "data" {
  bucket = "critical-data"

  lifecycle {
    prevent_destroy = true  # terraform destroy 會報錯停止
  }
}
```

**Provider 版本要鎖定**：不鎖版本，`terraform init` 會裝最新版，可能有 breaking change。`.terraform.lock.hcl` 要 commit 到 git，確保團隊用同一個版本。

## 小結

Terraform 把基礎設施變成可以 review、可以版本控制、可以重複使用的程式碼。`plan` 讓你在執行前看清楚會發生什麼，`state` 讓 Terraform 知道現在的狀態，`module` 讓設定可以在不同環境重用。

從一個小專案開始，把現有的雲端設定用 import 匯入，慢慢把 ClickOps 替換成程式碼，基礎設施就有了 git history。
