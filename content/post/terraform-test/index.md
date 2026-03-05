---
title: 'terraform test：內建的 Terraform 模組測試框架，不需要 Go'
date: '2026-03-15T09:00:00+08:00'
slug: terraform-test
description: 'Terraform 1.6 內建測試框架，用 .tftest.hcl 寫測試，支援 plan-only 單元測試、mock_provider 無需雲端憑證、expect_failures 驗證錯誤、apply 整合測試。不需要學 Go，直接用 HCL 寫。'
categories:
  - DevOps
tags:
  - terraform
  - testing
  - infrastructure-as-code
  - devops
---

Terraform module 寫好了，怎麼確認 variable validation 是否正確？versioning 有沒有照設定開啟？tag 有沒有被正確傳進去？
以前只能靠 `terraform plan` 肉眼看輸出，或者用 Go 寫 Terratest。
Terraform 1.6 開始內建測試框架，直接用 HCL 寫測試，`terraform test` 執行，不需要學 Go，也不需要多裝任何工具。

## 兩種測試模式

`terraform test` 支援兩種測試方式：

- **Plan-only（單元測試）**：`command = plan`，搭配 `mock_provider` 完全不需要雲端憑證，純粹驗證 plan 的輸出
- **Apply（整合測試）**：`command = apply`，真的建立資源，測試完自動 destroy

這篇用一個 S3 bucket module 當範例，從單元測試到整合測試都走一遍。

## 模組結構

```
s3-bucket-module/
├── main.tf
├── variables.tf
├── outputs.tf
└── tests/
    ├── setup/          # 整合測試的前置資源
    │   ├── main.tf
    │   └── outputs.tf
    ├── unit.tftest.hcl         # plan + mock，不需要憑證
    └── integration.tftest.hcl  # apply，真的建資源
```

### 模組本身

```hcl
# variables.tf
variable "bucket_name" {
  type = string

  validation {
    condition     = length(var.bucket_name) >= 3 && length(var.bucket_name) <= 63
    error_message = "bucket name 長度必須在 3 到 63 字元之間。"
  }

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.bucket_name))
    error_message = "bucket name 只能用小寫字母、數字、連字號和點。"
  }
}

variable "environment" {
  type = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment 必須是 dev、staging 或 prod。"
  }
}

variable "enable_versioning" {
  type    = bool
  default = false
}

variable "force_destroy" {
  type    = bool
  default = false
}
```

```hcl
# main.tf
resource "aws_s3_bucket" "main" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

```hcl
# outputs.tf
output "bucket_id" {
  value = aws_s3_bucket.main.id
}

output "bucket_arn" {
  value = aws_s3_bucket.main.arn
}
```

## 單元測試：mock_provider + plan

Terraform 1.7 加入了 `mock_provider`，讓你在完全沒有 AWS 憑證的情況下測試。Terraform 會產生假的 resource 屬性，你可以用 `mock_resource` 指定特定屬性的值。

```hcl
# tests/unit.tftest.hcl

# 用假的 aws provider，不會打真實 API
mock_provider "aws" {
  mock_resource "aws_s3_bucket" {
    defaults = {
      arn    = "arn:aws:s3:::mock-bucket-name"
      region = "us-east-1"
      id     = "mock-bucket-name"
    }
  }

  mock_resource "aws_s3_bucket_versioning" {
    defaults = {
      id = "mock-bucket-name"
    }
  }

  mock_resource "aws_s3_bucket_server_side_encryption_configuration" {
    defaults = {
      id = "mock-bucket-name"
    }
  }
}

# 檔案層級的 variables，所有 run block 都套用
variables {
  environment   = "dev"
  force_destroy = true
}
```

### assert：驗證 plan 的結果

```hcl
run "versioning_enabled_when_variable_is_true" {
  command = plan

  variables {
    bucket_name       = "my-app-dev-assets"
    enable_versioning = true
  }

  assert {
    condition     = aws_s3_bucket.main.bucket == "my-app-dev-assets"
    error_message = "bucket name 設定不正確。"
  }

  assert {
    condition     = aws_s3_bucket.main.tags["Environment"] == "dev"
    error_message = "Environment tag 必須是 dev。"
  }

  assert {
    condition     = aws_s3_bucket.main.tags["ManagedBy"] == "terraform"
    error_message = "ManagedBy tag 必須是 terraform。"
  }

  assert {
    condition     = aws_s3_bucket_versioning.main.versioning_configuration[0].status == "Enabled"
    error_message = "enable_versioning = true 時 versioning 應該是 Enabled。"
  }
}

run "versioning_suspended_by_default" {
  command = plan

  variables {
    bucket_name       = "my-app-dev-logs"
    enable_versioning = false
  }

  assert {
    condition     = aws_s3_bucket_versioning.main.versioning_configuration[0].status == "Suspended"
    error_message = "enable_versioning = false 時 versioning 應該是 Suspended。"
  }
}

run "encryption_always_aes256" {
  command = plan

  variables {
    bucket_name = "my-app-dev-data"
  }

  assert {
    condition     = aws_s3_bucket_server_side_encryption_configuration.main.rule[0].apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "加密演算法必須是 AES256。"
  }
}
```

### expect_failures：測試 validation 規則

`expect_failures` 用來測試「這個輸入應該要被拒絕」的負面情境：

```hcl
run "bucket_name_too_short" {
  command = plan

  variables {
    bucket_name = "ab"  # 只有 2 個字元，應該失敗
  }

  expect_failures = [
    var.bucket_name,
  ]
}

run "bucket_name_uppercase_rejected" {
  command = plan

  variables {
    bucket_name = "MyBucketWithUppercase"
  }

  expect_failures = [
    var.bucket_name,
  ]
}

run "invalid_environment_rejected" {
  command = plan

  variables {
    bucket_name = "valid-bucket-name"
    environment = "production"  # 不在允許的清單裡
  }

  expect_failures = [
    var.environment,
  ]
}
```

`expect_failures` 接受的對象：
- `var.名稱` — variable 的 validation block
- `resource.type.name` — resource 的 lifecycle precondition/postcondition
- `output.名稱` — output 的 precondition
- `check.名稱` — check block

## 整合測試：真的 apply

整合測試會真的建立 AWS 資源，測試完 Terraform 會自動 destroy。要有真實的 AWS 憑證。

### Setup Module：產生唯一的 bucket 名稱

同時跑多次測試時，bucket 名稱會衝突。用 setup module 產生隨機後綴：

```hcl
# tests/setup/main.tf
terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}
```

```hcl
# tests/setup/outputs.tf
output "test_prefix" {
  value = "tftest-${random_id.suffix.hex}"
}
```

### 整合測試檔案

```hcl
# tests/integration.tftest.hcl

provider "aws" {
  region = "us-east-1"
}

variables {
  environment   = "dev"
  force_destroy = true  # 測試完才能 destroy，這個必須是 true
}

# 先跑 setup，產生唯一的 prefix
run "setup" {
  module {
    source = "./setup"
  }
}

# 用 run.setup.test_prefix 引用上一個 run 的輸出
run "create_basic_bucket" {
  command = apply

  variables {
    bucket_name       = "${run.setup.test_prefix}-basic"
    enable_versioning = false
  }

  assert {
    condition     = aws_s3_bucket.main.id == "${run.setup.test_prefix}-basic"
    error_message = "bucket ID 不符合預期。"
  }

  assert {
    condition     = can(regex("^arn:aws:s3:::", aws_s3_bucket.main.arn))
    error_message = "bucket ARN 格式不正確：${aws_s3_bucket.main.arn}"
  }
}

run "create_versioned_bucket" {
  command = apply

  variables {
    bucket_name       = "${run.setup.test_prefix}-versioned"
    enable_versioning = true
  }

  assert {
    condition     = aws_s3_bucket_versioning.main.versioning_configuration[0].status == "Enabled"
    error_message = "versioning 應該是 Enabled。"
  }

  assert {
    condition     = output.bucket_arn != ""
    error_message = "bucket_arn output 不能是空的。"
  }
}

run "verify_tags" {
  command = apply

  variables {
    bucket_name = "${run.setup.test_prefix}-tagged"
    environment = "staging"
  }

  assert {
    condition     = aws_s3_bucket.main.tags["Environment"] == "staging"
    error_message = "Environment tag 應該是 staging。"
  }

  assert {
    condition     = aws_s3_bucket.main.tags["ManagedBy"] == "terraform"
    error_message = "ManagedBy tag 必須是 terraform。"
  }
}
```

每個 `run` block 有自己的 state，run 結束後資源不會馬上 destroy，整個測試檔案跑完才會統一 destroy，而且是反向順序（最後建的最先砍）。

## 執行測試

```bash
# 跑所有測試（unit + integration）
terraform test

# 只跑單元測試（快，不需要憑證）
terraform test -filter=tests/unit.tftest.hcl

# 只跑整合測試
terraform test -filter=tests/integration.tftest.hcl

# 顯示詳細輸出（每個 run block 的 plan/state）
terraform test -verbose

# JSON 輸出給 CI 解析
terraform test -json

# JUnit XML 給 CI dashboard（GitHub Actions、Jenkins）
terraform test -junit-xml=test-results.xml

# 覆蓋 variable
terraform test -var="environment=staging"
```

輸出範例：

```
tests/unit.tftest.hcl... in progress
  run "versioning_enabled_when_variable_is_true"... pass
  run "versioning_suspended_by_default"... pass
  run "encryption_always_aes256"... pass
  run "bucket_name_too_short"... pass
  run "bucket_name_uppercase_rejected"... pass
  run "invalid_environment_rejected"... pass
tests/unit.tftest.hcl... tearing down
tests/unit.tftest.hcl... pass

Success! 6 passed, 0 failed.
```

## Variables 優先順序

測試檔案裡的 variables 跟正常的 Terraform 優先順序一樣：

| 優先順序 | 來源 |
|---------|------|
| 最高 | `run` block 內的 `variables {}` |
| ↓ | CLI `-var` 和 `-var-file` |
| ↓ | `.auto.tfvars` |
| ↓ | `terraform.tfvars` |
| ↓ | 環境變數 `TF_VAR_*` |
| ↓ | 測試檔案層級的 `variables {}` |
| 最低 | variable 的 `default` 值 |

## terraform test vs Terratest

| | terraform test | [Terratest](/p/terratest-infrastructure-testing/) |
|--|--|--|
| 語言 | HCL | Go |
| 版本要求 | Terraform 1.6+ | Go 1.21+ |
| Mock 支援 | ✓（mock_provider，v1.7+） | ✗（一定要真實資源）|
| 單元測試 | ✓ | 困難 |
| 整合測試 | ✓ | ✓（更靈活）|
| HTTP 驗證 | ✗ | ✓（http_helper）|
| 複雜驗證邏輯 | 有限（HCL expression） | 完整（Go 程式）|
| 學習曲線 | 低（已知 HCL） | 中（需要 Go）|
| CI 整合 | `-junit-xml` | go test -v |

選 `terraform test` 的時機：驗證 module 的 variable validation、resource 屬性設定是否正確、不需要複雜驗證邏輯。

選 Terratest 的時機：需要 HTTP 請求驗證、需要複雜的 retry 邏輯、需要跨服務的整合測試。

## 小結

`terraform test` 最大的優點是零門檻：已經在寫 HCL，就能寫測試。`mock_provider` 讓你可以在 CI 上完全不需要雲端憑證跑單元測試，`expect_failures` 讓 variable validation 規則有辦法自動驗證，不再靠肉眼。

從單元測試開始，把現有 module 的 validation 規則都補上測試，確保改動不會破壞預期行為。
