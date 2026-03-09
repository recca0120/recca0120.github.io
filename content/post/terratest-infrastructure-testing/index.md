---
title: 'Terratest：Terraform 基礎設施的自動化整合測試'
date: '2026-03-14T09:00:00+08:00'
slug: terratest-infrastructure-testing
image: featured.jpg
description: 'Terratest 是一個用 Go 撰寫真實整合測試的函式庫，針對 Terraform 模組部署真實基礎設施、驗證其行為，然後銷毀。涵蓋 terraform、http_helper、aws、retry、test_structure 套件，附完整 Go 程式碼範例。'
categories:
  - DevOps
tags:
  - terratest
  - terraform
  - go
  - testing
  - aws
  - infrastructure
---

`terraform validate` 檢查語法，`terraform plan` 預覽變更，但兩者都無法告訴你部署的基礎設施是否真的能正常運作。[Terratest](https://terratest.gruntwork.io/) 填補了這個缺口——它部署真實的基礎設施，對其執行斷言，然後銷毀，全部透過 Go 標準的 `testing` 套件完成。

## Terratest 是什麼，為什麼需要它

Terraform 內建的 `terraform test` 指令（v1.6 引入）針對模擬或臨時配置執行測試，適合對個別模組邏輯做單元測試，但並非設計來驗證跨真實 AWS、GCP 或 Azure 資源的端對端行為。

Terratest 採取不同立場：全部用真實環境部署，打實際的 endpoint、查詢真實 API、驗證輸出，然後全部拆掉。這意味著：

- S3 bucket 測試會真正建立 bucket、確認版本控制已啟用、確認 policy，然後刪除 bucket。
- EC2 測試會真正啟動 instance、等待它回應 HTTP，然後終止。
- VPC 測試會真正建立網路、確認路由表存在，然後移除所有資源。

代價是時間與金錢——真實基礎設施需要幾分鐘且會產生費用。回報是對模組在真實環境中確實可運作的信心，而非僅在模擬中通過。

Terratest 由 [Gruntwork](https://gruntwork.io/) 維護，Apache 2.0 授權，目前版本為 v0.56.0（2026 年 2 月），需要 Go >= 1.21.1。

### Terratest vs terraform test

| 面向 | terraform test | Terratest |
|---|---|---|
| 語言 | HCL | Go |
| 基礎設施 | 模擬或臨時 | 真實雲端資源 |
| 範疇 | 模組單元測試 | 整合 / 端對端 |
| HTTP 驗證 | 無 | 有（http_helper） |
| AWS/GCP API 檢查 | 無 | 有（aws、gcp 套件） |
| 重試邏輯 | 有限 | 第一等公民（retry 套件） |
| 平行測試 | 有限 | 原生 `t.Parallel()` |
| 階段跳過 | 無 | 有（test_structure） |

對模組邏輯做快速、低成本的單元檢查用 `terraform test`。需要證明已部署的系統行為正確時用 Terratest。

## 安裝與專案設定

從 [go.dev/dl](https://go.dev/dl/) 安裝 Go >= 1.21.1，然後建立如下的目錄結構：

```
my-terraform-module/
├── main.tf
├── variables.tf
├── outputs.tf
└── test/
    ├── go.mod
    ├── go.sum
    └── module_test.go
```

在 `test/` 目錄內初始化 Go module：

```bash
cd test
go mod init github.com/your-org/your-repo
go get github.com/gruntwork-io/terratest@v0.56.0
go get github.com/stretchr/testify@v1.9.0
go mod tidy
```

`go.mod` 看起來會像：

```go
module github.com/your-org/your-repo

go 1.21.1

require (
    github.com/gruntwork-io/terratest v0.56.0
    github.com/stretchr/testify v1.9.0
)
```

執行測試時需要延長 timeout——基礎設施操作需要時間：

```bash
go test -v -timeout 30m ./...
```

Go 預設 timeout 是 10 分鐘。大多數基礎設施測試需要 15–30 分鐘，請務必明確設定 `-timeout`。

## 核心模式：部署、驗證、銷毀

每個 Terratest 測試都遵循相同的三階段結構：

```go
func TestMyModule(t *testing.T) {
    t.Parallel()

    terraformOptions := &terraform.Options{
        TerraformDir: "../",
        Vars: map[string]interface{}{
            "region": "us-east-1",
        },
    }

    // 第三階段：銷毀——先註冊，最後才執行，即使測試失敗也會執行
    defer terraform.Destroy(t, terraformOptions)

    // 第一階段：部署
    terraform.InitAndApply(t, terraformOptions)

    // 第二階段：驗證
    bucketName := terraform.Output(t, terraformOptions, "bucket_name")
    assert.NotEmpty(t, bucketName)
}
```

`defer terraform.Destroy(...)` 這行至關重要。在 Go 中，defer 的呼叫會在外層函式回傳時執行——不論是正常回傳或因測試失敗而回傳。在部署前就註冊清理動作，能確保即使 `InitAndApply` 或任何斷言發生 panic，destroy 依然會執行。

## terraform 套件

`terraform` 套件包裝了 Terraform CLI。每個函式都有兩種變體：普通變體在錯誤時呼叫 `t.Fatal()`，加 `E` 後綴的變體回傳 `error` 供明確處理。

### terraform.Options

```go
terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
    // 必填：包含 .tf 檔案的目錄路徑
    TerraformDir: "../examples/my-module",

    // -var 旗標
    Vars: map[string]interface{}{
        "instance_type": "t3.micro",
        "environment":   "test",
    },

    // -var-file 旗標
    VarFiles: []string{"test.tfvars"},

    // 抑制輸出中的顏色代碼
    NoColor: true,

    // 覆寫 backend 配置
    BackendConfig: map[string]interface{}{
        "bucket": "my-tf-state",
        "key":    "test/terraform.tfstate",
    },
})
```

`WithDefaultRetryableErrors` 為 options 加上一組常見的暫時性錯誤，Terratest 遇到這些錯誤會自動重試，例如「connection reset by peer」或「Provider produced inconsistent result after apply」。

### InitAndApply

```go
// 執行 terraform init 再執行 terraform apply -auto-approve
// 任一指令返回非零退出碼時立即讓測試失敗
terraform.InitAndApply(t, terraformOptions)

// E 變體：回傳 error 而非讓測試失敗
output, err := terraform.InitAndApplyE(t, terraformOptions)
if err != nil {
    t.Logf("Apply 失敗：%v\n輸出：%s", err, output)
    t.FailNow()
}
```

### Output

```go
// 單一字串輸出
bucketID := terraform.Output(t, terraformOptions, "bucket_id")

// List 輸出（Terraform list 型別）
subnetIDs := terraform.OutputList(t, terraformOptions, "subnet_ids")

// Map 輸出（Terraform map 型別）
tags := terraform.OutputMap(t, terraformOptions, "resource_tags")

// 所有輸出，以 map[string]interface{} 形式回傳
allOutputs := terraform.OutputAll(t, terraformOptions)

// 結構化輸出，反序列化到 Go struct
type BucketInfo struct {
    Name   string `json:"name"`
    Region string `json:"region"`
}
var info BucketInfo
terraform.OutputStruct(t, terraformOptions, "bucket_info", &info)
```

### Plan

```go
// 執行 plan 並回傳原始輸出
planOutput := terraform.InitAndPlan(t, terraformOptions)

// 取得退出碼：0 = 無變更，1 = 錯誤，2 = 有變更
exitCode := terraform.PlanExitCode(t, terraformOptions)
assert.Equal(t, 2, exitCode) // 斷言將有變更發生
```

### Destroy

```go
// 永遠搭配 defer 使用
defer terraform.Destroy(t, terraformOptions)
```

## http_helper 套件

`http_helper` 套件處理帶有內建重試邏輯的 HTTP 驗證——這是必要的，因為新部署的伺服器需要時間才能就緒。

### HttpGetWithRetry

```go
import (
    "crypto/tls"
    "time"
    http_helper "github.com/gruntwork-io/terratest/modules/http-helper"
)

instanceURL := terraform.Output(t, terraformOptions, "instance_url")

tlsConfig := &tls.Config{} // 空值 = 使用系統 CA

http_helper.HttpGetWithRetry(
    t,
    instanceURL,
    tlsConfig,
    200,            // 預期的 HTTP 狀態碼
    "Hello, World", // 回應 body 中預期包含的字串
    30,             // 最大重試次數
    5*time.Second,  // 每次重試間隔
)
```

這會每 5 秒輪詢 `instanceURL`，最多 30 次（共 2.5 分鐘）。若伺服器返回 200 且 body 包含「Hello, World」，測試通過。若重試次數耗盡，測試失敗並附上描述性訊息。

### HttpGetWithRetryWithCustomValidation

當你需要對什麼算是有效回應有更多控制時：

```go
http_helper.HttpGetWithRetryWithCustomValidation(
    t,
    instanceURL,
    tlsConfig,
    30,
    5*time.Second,
    func(statusCode int, body string) bool {
        return statusCode == 200 && strings.Contains(body, "healthy")
    },
)
```

### 跳過 TLS 驗證（自簽憑證）

```go
tlsConfig := &tls.Config{InsecureSkipVerify: true}
```

僅在你掌控基礎設施的測試環境中使用。

## aws 套件

`aws` 套件將 AWS SDK 呼叫包裝成測試友善的函式。

### Region 選擇

```go
import "github.com/gruntwork-io/terratest/modules/aws"

// 隨機選取穩定的 region（排除測試中常不穩定的 region）
awsRegion := aws.GetRandomStableRegion(t, nil, nil)

// 限定特定 region
awsRegion := aws.GetRandomStableRegion(t, []string{"us-east-1", "us-west-2"}, nil)

// 排除特定 region
awsRegion := aws.GetRandomStableRegion(t, nil, []string{"ap-southeast-1"})
```

### AMI 查詢

```go
// 取得符合篩選條件的最新 AMI
amiID := aws.GetMostRecentAmiId(t, awsRegion, "amazon", map[string][]string{
    "name":                []string{"amzn2-ami-hvm-*-x86_64-gp2"},
    "virtualization-type": []string{"hvm"},
})

// 常用 AMI 的便利函式
amazonLinuxAMI := aws.GetAmazonLinuxAmi(t, awsRegion)
ubuntuAMI      := aws.GetUbuntu2004Ami(t, awsRegion)
```

### EC2 instance 類型選擇

```go
// 在指定 region 中選取第一個可用的 instance 類型
instanceType := aws.GetRecommendedInstanceType(t, awsRegion,
    []string{"t3.micro", "t2.micro", "t3.small"},
)
```

### S3 bucket 檢查

```go
bucketID := terraform.Output(t, terraformOptions, "bucket_id")

// 斷言 bucket 存在
aws.AssertS3BucketExists(t, awsRegion, bucketID)

// 檢查版本控制狀態：回傳 "Enabled"、"Suspended" 或 ""
versioningStatus := aws.GetS3BucketVersioning(t, awsRegion, bucketID)
assert.Equal(t, "Enabled", versioningStatus)

// 斷言 bucket policy 已附加（非空）
aws.AssertS3BucketPolicyExists(t, awsRegion, bucketID)

// 取得原始 policy JSON
policyJSON := aws.GetS3BucketPolicy(t, awsRegion, bucketID)
assert.Contains(t, policyJSON, "aws:SecureTransport")

// 檢查伺服器存取日誌配置
loggingTarget := aws.GetS3BucketLoggingTarget(t, awsRegion, bucketID)
loggingPrefix := aws.GetS3BucketLoggingTargetPrefix(t, awsRegion, bucketID)
assert.Equal(t, bucketID+"-logs", loggingTarget)
assert.Equal(t, "access-logs/", loggingPrefix)

// 讀寫物件
aws.PutS3ObjectContents(t, awsRegion, bucketID, "test-key", strings.NewReader("hello"))
contents := aws.GetS3ObjectContents(t, awsRegion, bucketID, "test-key")
assert.Equal(t, "hello", contents)
```

### EC2 查詢

```go
instanceID := terraform.Output(t, terraformOptions, "instance_id")

publicIP  := aws.GetPublicIpOfEc2Instance(t, instanceID, awsRegion)
privateIP := aws.GetPrivateIpOfEc2Instance(t, instanceID, awsRegion)

// 透過 tag 尋找 instance
instanceIDs := aws.GetEc2InstanceIdsByTag(t, awsRegion, "Name", "my-web-server")

// 取得 instance 的 tags
tags := aws.GetTagsForEc2Instance(t, awsRegion, instanceID)
assert.Equal(t, "production", tags["Environment"])
```

### 其他 AWS 服務

```go
// Lambda 調用
result := aws.InvokeFunction(t, awsRegion, "my-function", map[string]string{"key": "value"})

// SSM Parameter Store
aws.PutParameter(t, awsRegion, "/myapp/db_url", "Database URL", "postgres://localhost/db")
value := aws.GetParameter(t, awsRegion, "/myapp/db_url")

// Secrets Manager
secretARN := aws.CreateSecretStringWithDefaultKey(t, awsRegion, "Test secret", "my-secret", `{"password":"abc123"}`)
defer aws.DeleteSecret(t, awsRegion, secretARN, true)
secretValue := aws.GetSecretValue(t, awsRegion, secretARN)
```

## retry 套件

Terratest 的 `retry` 套件提供獨立於特定基礎設施 helper 的明確重試控制。

### DoWithRetry

```go
import (
    "time"
    "github.com/gruntwork-io/terratest/modules/retry"
)

result := retry.DoWithRetry(
    t,
    "等待資料庫就緒",    // 用於日誌訊息的描述
    20,                  // 最大重試次數
    15*time.Second,      // 每次重試間隔
    func() (string, error) {
        err := pingDatabase(dbHost, dbPort)
        if err != nil {
            return "", fmt.Errorf("資料庫尚未就緒：%w", err)
        }
        return "ready", nil
    },
)
t.Logf("資料庫狀態：%s", result)
```

若 action 回傳任何非 nil 的 error，Terratest 會等待後重試。若所有重試都耗盡，測試失敗。

### FatalError：跳過重試

```go
result := retry.DoWithRetry(t, "檢查 endpoint", 10, 5*time.Second, func() (string, error) {
    status, body, err := http_helper.HttpGetE(t, url, nil)
    if err != nil {
        return "", err // 可重試——網路錯誤
    }
    if status == 404 {
        // 404 是永久性失敗，重試沒有意義
        return "", retry.FatalError{Underlying: fmt.Errorf("對 %s 收到 404", url)}
    }
    if status != 200 {
        return "", fmt.Errorf("意外的狀態碼 %d", status) // 可重試
    }
    return body, nil
})
```

### DoWithRetryE

當你想自行處理「所有重試都耗盡」的情況，而非讓測試直接失敗時：

```go
result, err := retry.DoWithRetryE(t, "健康檢查", 5, 10*time.Second, func() (string, error) {
    return checkHealth()
})
if err != nil {
    t.Logf("健康檢查始終未通過：%v", err)
    // 自訂處理，而非立即讓測試失敗
}
```

### DoWithRetryableErrors

僅針對特定錯誤模式（以 regex 匹配）重試：

```go
result := retry.DoWithRetryableErrors(
    t,
    "apply terraform",
    map[string]string{
        ".*connection reset by peer.*":  "暫時性網路錯誤",
        ".*timeout.*":                   "逾時，將重試",
    },
    5,
    30*time.Second,
    func() (string, error) {
        return terraform.InitAndApplyE(t, terraformOptions)
    },
)
```

不符合任何模式的錯誤會立即被包裝成 `FatalError`，測試失敗且不重試。

### 背景輪詢

```go
// 在其他測試步驟執行期間在背景持續輪詢
done := retry.DoInBackgroundUntilStopped(t, "監控健康狀態", 10*time.Second, func() {
    status, _, _ := http_helper.HttpGetE(t, healthURL, nil)
    t.Logf("健康檢查狀態：%d", status)
})

// ... 執行其他測試步驟 ...

done() // 停止背景 goroutine
```

## test_structure 套件

長時間執行的基礎設施測試在反覆迭代時很令人痛苦。如果測試需要 20 分鐘，而在驗證步驟失敗，你不會希望每次都從頭重新部署。`test_structure` 套件透過將測試拆分為可獨立跳過的命名階段來解決這個問題。

### RunTestStage 與 SKIP_ 環境變數

```go
import testStructure "github.com/gruntwork-io/terratest/modules/test-structure"

func TestMyModule(t *testing.T) {
    t.Parallel()

    workingDir := "../examples/my-module"

    // 階段 1：部署
    testStructure.RunTestStage(t, "deploy", func() {
        awsRegion := aws.GetRandomStableRegion(t, nil, nil)

        terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
            TerraformDir: workingDir,
            Vars: map[string]interface{}{
                "region": awsRegion,
            },
        })

        // 儲存狀態供後續階段載入
        testStructure.SaveTerraformOptions(t, workingDir, terraformOptions)
        testStructure.SaveString(t, workingDir, "awsRegion", awsRegion)

        terraform.InitAndApply(t, terraformOptions)
    })

    // 階段 2：驗證
    testStructure.RunTestStage(t, "validate", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        awsRegion        := testStructure.LoadString(t, workingDir, "awsRegion")

        bucketID := terraform.Output(t, terraformOptions, "bucket_id")
        aws.AssertS3BucketExists(t, awsRegion, bucketID)
    })

    // 階段 3：拆除
    testStructure.RunTestStage(t, "teardown", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        terraform.Destroy(t, terraformOptions)
    })
}
```

只重新執行驗證階段（部署已完成）：

```bash
SKIP_deploy=true SKIP_teardown=true go test -v -run TestMyModule -timeout 30m
```

`RunTestStage` 會檢查 `SKIP_<stageName>` 環境變數，若設定了任意非空值，該階段的主體就會被跳過。

### 儲存和載入測試資料

```go
// 儲存和載入 TerraformOptions（序列化為 workingDir 中的 JSON）
testStructure.SaveTerraformOptions(t, workingDir, terraformOptions)
terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)

// 儲存和載入任意字串
testStructure.SaveString(t, workingDir, "awsRegion", "us-east-1")
region := testStructure.LoadString(t, workingDir, "awsRegion")

// 儲存和載入整數
testStructure.SaveInt(t, workingDir, "port", 8080)
port := testStructure.LoadInt(t, workingDir, "port")

// 儲存和載入 EC2 金鑰對
testStructure.SaveEc2KeyPair(t, workingDir, keyPair)
keyPair := testStructure.LoadEc2KeyPair(t, workingDir)
```

資料以 JSON 檔案形式寫入 `workingDir`，路徑格式為 `<workingDir>/.test-data/<name>.json`。

### CopyTerraformFolderToTemp

多個平行測試共用同一個 Terraform 目錄時，會在 `.terraform/` 和 `terraform.tfstate` 上衝突。解決方案是為每個測試將模組複製到暫存目錄：

```go
rootFolder                    := ".."
terraformFolderRelativeToRoot := "examples/my-module"

// 將整個 repo 複製到暫存目錄，回傳其中模組的路徑
tempTestFolder := testStructure.CopyTerraformFolderToTemp(t, rootFolder, terraformFolderRelativeToRoot)

terraformOptions := &terraform.Options{
    TerraformDir: tempTestFolder,
}
```

設定了任何 `SKIP_*` 變數時，`CopyTerraformFolderToTemp` 會跳過複製並回傳原始路徑——在反覆迭代執行之間保留快取狀態。

## 平行測試

平行執行測試能大幅縮短有多個獨立模組需要測試時的 CI 總時間。

### t.Parallel()

```go
func TestModuleA(t *testing.T) {
    t.Parallel() // 此測試與其他平行測試並發執行
    // ...
}

func TestModuleB(t *testing.T) {
    t.Parallel()
    // ...
}
```

### 命名空間隔離，避免衝突

在同一個 AWS 帳號中平行執行測試時，資源名稱必須唯一：

```go
import "github.com/gruntwork-io/terratest/modules/random"

uniqueID   := random.UniqueId() // 6 個字元的隨機英數字串
bucketName := fmt.Sprintf("my-test-bucket-%s", strings.ToLower(uniqueID))
```

`random.UniqueId()` 產生適合作為資源名稱後綴的短隨機字串。

### 表格驅動的平行子測試

```go
func TestS3BucketConfigurations(t *testing.T) {
    t.Parallel()

    testCases := []struct {
        name        string
        withPolicy  bool
        withLogging bool
    }{
        {"with-policy-and-logging", true, true},
        {"policy-only", true, false},
        {"logging-only", false, true},
    }

    for _, tc := range testCases {
        tc := tc // 捕獲 range 變數
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()

            uniqueID   := random.UniqueId()
            awsRegion  := aws.GetRandomStableRegion(t, nil, nil)
            bucketName := fmt.Sprintf("test-%s-%s", tc.name, strings.ToLower(uniqueID))

            terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
                TerraformDir: "../examples/s3-module",
                Vars: map[string]interface{}{
                    "bucket_name":  bucketName,
                    "region":       awsRegion,
                    "with_policy":  tc.withPolicy,
                    "with_logging": tc.withLogging,
                },
            })

            defer terraform.Destroy(t, terraformOptions)
            terraform.InitAndApply(t, terraformOptions)

            aws.AssertS3BucketExists(t, awsRegion, bucketName)
            if tc.withPolicy {
                aws.AssertS3BucketPolicyExists(t, awsRegion, bucketName)
            }
        })
    }
}
```

每個子測試平行執行，部署各自獨立的 bucket。

## 實作範例：端對端測試 S3 模組

這是一個完整可執行的範例，測試帶有版本控制、bucket policy 和伺服器存取日誌的 Terraform S3 模組。

### Terraform 模組（examples/s3-module/main.tf）

```hcl
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region"      { type = string }
variable "bucket_name" { type = string }
variable "environment" { type = string  default = "test" }
variable "with_policy" { type = bool    default = true }

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "main" {
  bucket        = var.bucket_name
  force_destroy = true
  tags = {
    Name        = var.bucket_name
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket" "logs" {
  bucket        = "${var.bucket_name}-logs"
  force_destroy = true
}

resource "aws_s3_bucket_logging" "main" {
  bucket        = aws_s3_bucket.main.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "access-logs/"
}

resource "aws_s3_bucket_policy" "main" {
  count  = var.with_policy ? 1 : 0
  bucket = aws_s3_bucket.main.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["${aws_s3_bucket.main.arn}", "${aws_s3_bucket.main.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

output "bucket_id"   { value = aws_s3_bucket.main.id }
output "bucket_arn"  { value = aws_s3_bucket.main.arn }
output "logs_bucket" { value = aws_s3_bucket.logs.id }
```

### 測試檔案（test/s3_module_test.go）

```go
package test

import (
    "fmt"
    "strings"
    "testing"
    "time"

    "github.com/gruntwork-io/terratest/modules/aws"
    http_helper "github.com/gruntwork-io/terratest/modules/http-helper"
    "github.com/gruntwork-io/terratest/modules/random"
    "github.com/gruntwork-io/terratest/modules/retry"
    "github.com/gruntwork-io/terratest/modules/terraform"
    testStructure "github.com/gruntwork-io/terratest/modules/test-structure"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestS3Module(t *testing.T) {
    t.Parallel()

    // 複製模組到暫存資料夾，避免平行測試之間的狀態衝突
    workingDir := testStructure.CopyTerraformFolderToTemp(t, "..", "examples/s3-module")

    // -----------------------------------------------------------------------
    // 階段：部署
    // -----------------------------------------------------------------------
    testStructure.RunTestStage(t, "deploy", func() {
        awsRegion  := aws.GetRandomStableRegion(t, nil, nil)
        uniqueID   := strings.ToLower(random.UniqueId())
        bucketName := fmt.Sprintf("terratest-s3-%s", uniqueID)

        terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
            TerraformDir: workingDir,
            Vars: map[string]interface{}{
                "region":      awsRegion,
                "bucket_name": bucketName,
                "environment": "automated-testing",
                "with_policy": true,
            },
            NoColor: true,
        })

        testStructure.SaveTerraformOptions(t, workingDir, terraformOptions)
        testStructure.SaveString(t, workingDir, "awsRegion", awsRegion)

        terraform.InitAndApply(t, terraformOptions)
    })

    // -----------------------------------------------------------------------
    // 階段：驗證
    // -----------------------------------------------------------------------
    testStructure.RunTestStage(t, "validate", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        awsRegion        := testStructure.LoadString(t, workingDir, "awsRegion")

        // 讀取輸出
        bucketID   := terraform.Output(t, terraformOptions, "bucket_id")
        logsBucket := terraform.Output(t, terraformOptions, "logs_bucket")

        require.NotEmpty(t, bucketID)
        require.NotEmpty(t, logsBucket)

        // 驗證 bucket 存在
        aws.AssertS3BucketExists(t, awsRegion, bucketID)

        // 驗證版本控制已啟用
        versioningStatus := aws.GetS3BucketVersioning(t, awsRegion, bucketID)
        assert.Equal(t, "Enabled", versioningStatus)

        // 驗證 bucket policy 已附加
        aws.AssertS3BucketPolicyExists(t, awsRegion, bucketID)

        // 驗證 policy 內容包含 TLS 拒絕聲明
        policy := aws.GetS3BucketPolicy(t, awsRegion, bucketID)
        assert.Contains(t, policy, "aws:SecureTransport")

        // 驗證伺服器存取日誌目標
        loggingTarget := aws.GetS3BucketLoggingTarget(t, awsRegion, bucketID)
        loggingPrefix := aws.GetS3BucketLoggingTargetPrefix(t, awsRegion, bucketID)
        assert.Equal(t, logsBucket, loggingTarget)
        assert.Equal(t, "access-logs/", loggingPrefix)

        // 驗證可以寫入和讀取物件（來回測試）
        testKey     := "test-objects/hello.txt"
        testContent := "hello from terratest"
        aws.PutS3ObjectContents(t, awsRegion, bucketID, testKey, strings.NewReader(testContent))

        // 使用 retry 處理最終一致性
        retry.DoWithRetry(t, "讀取 S3 物件", 5, 3*time.Second, func() (string, error) {
            contents := aws.GetS3ObjectContents(t, awsRegion, bucketID, testKey)
            if contents != testContent {
                return "", fmt.Errorf("預期 %q，得到 %q", testContent, contents)
            }
            return contents, nil
        })
    })

    // -----------------------------------------------------------------------
    // 階段：拆除
    // -----------------------------------------------------------------------
    testStructure.RunTestStage(t, "teardown", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        terraform.Destroy(t, terraformOptions)
    })
}
```

### 執行測試

```bash
# 完整執行
go test -v -run TestS3Module -timeout 30m

# 只重新執行驗證階段（部署已完成）
SKIP_deploy=true SKIP_teardown=true go test -v -run TestS3Module -timeout 10m

# 重新執行驗證和拆除（跳過部署）
SKIP_deploy=true go test -v -run TestS3Module -timeout 30m
```

## 實作範例：EC2 + HTTP 驗證

這個範例部署一個提供網頁服務的 EC2 instance，然後驗證 HTTP 回應。

```go
func TestEC2WebServer(t *testing.T) {
    t.Parallel()

    awsRegion    := aws.GetRandomStableRegion(t, nil, nil)
    uniqueID     := random.UniqueId()
    instanceName := fmt.Sprintf("terratest-web-%s", strings.ToLower(uniqueID))
    responseText := fmt.Sprintf("Hello from %s", uniqueID)

    // 為選定的 region 選取可用的 instance 類型
    instanceType := aws.GetRecommendedInstanceType(t, awsRegion,
        []string{"t3.micro", "t2.micro", "t3.small"},
    )

    // 取得最新的 Amazon Linux 2 AMI
    amiID := aws.GetMostRecentAmiId(t, awsRegion, "amazon", map[string][]string{
        "name":                {"amzn2-ami-hvm-*-x86_64-gp2"},
        "virtualization-type": {"hvm"},
    })

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../examples/ec2-web",
        Vars: map[string]interface{}{
            "aws_region":    awsRegion,
            "ami_id":        amiID,
            "instance_type": instanceType,
            "instance_name": instanceName,
            "response_text": responseText,
        },
        NoColor: true,
    })

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    instanceURL := terraform.Output(t, terraformOptions, "instance_url")

    // 等待最多 5 分鐘讓伺服器啟動
    http_helper.HttpGetWithRetry(
        t,
        instanceURL,
        nil,
        200,
        responseText,
        60,
        5*time.Second,
    )
}
```

## 錯誤處理慣例

每個 Terratest 函式都遵循相同的慣例：

- `terraform.InitAndApply(t, opts)` — 錯誤時呼叫 `t.Fatal()`，測試立即停止。
- `terraform.InitAndApplyE(t, opts)` — 回傳 `(string, error)`，由你決定如何處理。

普通變體適用於大多數測試，因為部署出錯時快速且明確地失敗是正確行為。當你需要條件邏輯，或預期部分失敗且想繼續時，才使用 `E` 變體。

```go
// 預期 plan 會失敗（例如測試無效輸入會被拒絕）
_, err := terraform.InitAndPlanE(t, terraformOptions)
require.Error(t, err, "預期使用無效配置時 plan 會失敗")

// 在斷言前先確認資源是否存在
exists := aws.GetS3BucketVersioning(t, awsRegion, bucketID)
if exists == "" {
    t.Log("版本控制未配置——確認是否有意停用")
}
```

## 小結

Terratest 涵蓋了 Terraform 模組的完整測試面向：

| 套件 | 功能 |
|---|---|
| `terraform` | 包裝 Terraform CLI：init、apply、plan、destroy、outputs |
| `http_helper` | 帶重試和自訂驗證的 HTTP GET 函式 |
| `aws` | AWS SDK 包裝：S3、EC2、AMI、RDS、Lambda、SSM、Secrets Manager |
| `retry` | 通用重試邏輯，支援 timeout、fatal error 和可重試錯誤模式 |
| `test_structure` | 基於階段的測試執行，在階段間持久化狀態 |
| `random` | 用於資源命名空間隔離的唯一 ID 產生 |

基本工作流程永遠不變：`defer Destroy`，然後 `InitAndApply`，然後斷言。其他一切都是將這些基本組件與重試邏輯、AWS API 呼叫和 HTTP 檢查組合在一起，以驗證模組所承諾提供的特定行為。

## 參考資源

- [Terratest 官方網站](https://terratest.gruntwork.io/)
- [Terratest GitHub 倉庫](https://github.com/gruntwork-io/terratest)
- [Terratest 官方文件](https://terratest.gruntwork.io/docs/)
- [Go 官方測試套件文件](https://pkg.go.dev/testing)
- [testify：Go 斷言函式庫](https://github.com/stretchr/testify)
- [Gruntwork 部落格：Terraform 測試策略](https://blog.gruntwork.io/)
