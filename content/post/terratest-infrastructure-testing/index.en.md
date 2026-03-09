---
title: 'Terratest: Automated Integration Testing for Terraform Infrastructure'
date: '2026-03-14T09:00:00+08:00'
slug: terratest-infrastructure-testing
image: featured.jpg
description: 'Terratest is a Go library for writing real integration tests against Terraform modules. It deploys actual infrastructure, validates it, then destroys it — covering terraform, http_helper, aws, retry, and test_structure packages with complete Go code examples.'
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

`terraform validate` checks syntax. `terraform plan` previews changes. Neither tells you whether the infrastructure you deploy actually works. [Terratest](https://terratest.gruntwork.io/) fills that gap by deploying real infrastructure, running assertions against it, then destroying it — all from Go's standard `testing` package.

## What Terratest Is and Why It Exists

Terraform's built-in `terraform test` command (introduced in v1.6) runs tests against mocked or ephemeral configurations. It is useful for unit-testing individual module logic but it is not designed to validate end-to-end behaviour across real AWS, GCP, or Azure resources.

Terratest takes a different position: deploy everything for real, hit the endpoints, query the APIs, verify the outputs, then tear it all down. This means:

- An S3 bucket test actually creates the bucket, checks versioning is enabled, checks the policy, then deletes the bucket.
- An EC2 test actually boots the instance, waits for it to respond to HTTP, then terminates it.
- A VPC test actually creates the network, confirms routing tables exist, then removes everything.

The tradeoff is cost and time — real infrastructure takes minutes and money. The payoff is confidence that your module works in the real world, not just in a simulation.

Terratest is maintained by [Gruntwork](https://gruntwork.io/), open-source under Apache 2.0, currently at v0.56.0 (February 2026). It requires Go >= 1.21.1.

### Terratest vs terraform test

| Aspect | terraform test | Terratest |
|---|---|---|
| Language | HCL | Go |
| Infrastructure | Mocked or ephemeral | Real cloud resources |
| Scope | Module unit tests | Integration / end-to-end |
| HTTP validation | No | Yes (http_helper) |
| AWS/GCP API checks | No | Yes (aws, gcp packages) |
| Retry logic | Limited | First-class (retry package) |
| Parallel tests | Limited | Native via `t.Parallel()` |
| Stage skipping | No | Yes (test_structure) |

Use `terraform test` for fast, cheap unit checks on module logic. Use Terratest when you need proof that the deployed system behaves correctly.

## Installation and Project Setup

Install Go >= 1.21.1 from [go.dev/dl](https://go.dev/dl/). Then structure your repository:

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

Initialize the Go module inside the `test/` directory:

```bash
cd test
go mod init github.com/your-org/your-repo
go get github.com/gruntwork-io/terratest@v0.56.0
go get github.com/stretchr/testify@v1.9.0
go mod tidy
```

Your `go.mod` will look like:

```go
module github.com/your-org/your-repo

go 1.21.1

require (
    github.com/gruntwork-io/terratest v0.56.0
    github.com/stretchr/testify v1.9.0
)
```

Run tests with an extended timeout — infrastructure operations take time:

```bash
go test -v -timeout 30m ./...
```

Go's default timeout is 10 minutes. Most infrastructure tests need 15–30 minutes. Always set `-timeout` explicitly.

## Core Pattern: Deploy, Validate, Destroy

Every Terratest test follows the same three-phase structure:

```go
func TestMyModule(t *testing.T) {
    t.Parallel()

    terraformOptions := &terraform.Options{
        TerraformDir: "../",
        Vars: map[string]interface{}{
            "region": "us-east-1",
        },
    }

    // Phase 3: destroy — registered first so it runs last, even on failure
    defer terraform.Destroy(t, terraformOptions)

    // Phase 1: deploy
    terraform.InitAndApply(t, terraformOptions)

    // Phase 2: validate
    bucketName := terraform.Output(t, terraformOptions, "bucket_name")
    assert.NotEmpty(t, bucketName)
}
```

The `defer terraform.Destroy(...)` line is critical. In Go, deferred calls execute when the surrounding function returns — whether it returns normally or due to a test failure. Registering cleanup before deployment guarantees that even if `InitAndApply` or any assertion panics, the destroy still runs.

## The terraform Package

The `terraform` package wraps the Terraform CLI. Every function has two variants: a plain variant that calls `t.Fatal()` on error, and an `E`-suffixed variant that returns `error` for explicit handling.

### terraform.Options

```go
terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
    // Required: path to the directory containing .tf files
    TerraformDir: "../examples/my-module",

    // -var flags
    Vars: map[string]interface{}{
        "instance_type": "t3.micro",
        "environment":   "test",
    },

    // -var-file flags
    VarFiles: []string{"test.tfvars"},

    // Suppress color codes in output
    NoColor: true,

    // Override the backend configuration
    BackendConfig: map[string]interface{}{
        "bucket": "my-tf-state",
        "key":    "test/terraform.tfstate",
    },
})
```

`WithDefaultRetryableErrors` wraps the options with a set of common transient errors that Terratest will automatically retry — things like "connection reset by peer" or "Provider produced inconsistent result after apply".

### InitAndApply

```go
// Runs terraform init then terraform apply -auto-approve
// Fails the test immediately if either command exits non-zero
terraform.InitAndApply(t, terraformOptions)

// E variant: returns error instead of failing the test
output, err := terraform.InitAndApplyE(t, terraformOptions)
if err != nil {
    t.Logf("Apply failed: %v\nOutput: %s", err, output)
    t.FailNow()
}
```

### Output

```go
// Single string output
bucketID := terraform.Output(t, terraformOptions, "bucket_id")

// List output (Terraform list type)
subnetIDs := terraform.OutputList(t, terraformOptions, "subnet_ids")

// Map output (Terraform map type)
tags := terraform.OutputMap(t, terraformOptions, "resource_tags")

// All outputs as map[string]interface{}
allOutputs := terraform.OutputAll(t, terraformOptions)

// Structured output deserialized into a Go struct
type BucketInfo struct {
    Name   string `json:"name"`
    Region string `json:"region"`
}
var info BucketInfo
terraform.OutputStruct(t, terraformOptions, "bucket_info", &info)
```

### Plan

```go
// Run plan and return the raw output
planOutput := terraform.InitAndPlan(t, terraformOptions)

// Get the exit code: 0 = no changes, 1 = error, 2 = changes present
exitCode := terraform.PlanExitCode(t, terraformOptions)
assert.Equal(t, 2, exitCode) // assert that changes will be made
```

### Destroy

```go
// Always used with defer
defer terraform.Destroy(t, terraformOptions)
```

## The http_helper Package

The `http_helper` package handles HTTP validation with built-in retry logic — essential because newly deployed servers take time to become healthy.

### HttpGetWithRetry

```go
import (
    "crypto/tls"
    "time"
    http_helper "github.com/gruntwork-io/terratest/modules/http-helper"
)

instanceURL := terraform.Output(t, terraformOptions, "instance_url")

tlsConfig := &tls.Config{} // empty = use system CAs

http_helper.HttpGetWithRetry(
    t,
    instanceURL,
    tlsConfig,
    200,            // expected HTTP status code
    "Hello, World", // expected substring in the response body
    30,             // max retries
    5*time.Second,  // sleep between retries
)
```

This polls `instanceURL` every 5 seconds up to 30 times (2.5 minutes total). If the server returns 200 with "Hello, World" in the body, the test passes. If the retries are exhausted, the test fails with a descriptive message.

### HttpGetWithRetryWithCustomValidation

When you need more control over what constitutes a valid response:

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

### Skipping TLS verification (self-signed certs)

```go
tlsConfig := &tls.Config{InsecureSkipVerify: true}
```

Use this only in test environments where you control the infrastructure.

## The aws Package

The `aws` package wraps AWS SDK calls into test-friendly functions.

### Region selection

```go
import "github.com/gruntwork-io/terratest/modules/aws"

// Pick a random stable region (excludes regions that are often flaky in tests)
awsRegion := aws.GetRandomStableRegion(t, nil, nil)

// Restrict to specific regions
awsRegion := aws.GetRandomStableRegion(t, []string{"us-east-1", "us-west-2"}, nil)

// Exclude specific regions
awsRegion := aws.GetRandomStableRegion(t, nil, []string{"ap-southeast-1"})
```

### AMI lookups

```go
// Get the most recent AMI matching filters
amiID := aws.GetMostRecentAmiId(t, awsRegion, "amazon", map[string][]string{
    "name":                []string{"amzn2-ami-hvm-*-x86_64-gp2"},
    "virtualization-type": []string{"hvm"},
})

// Convenience functions for common AMIs
amazonLinuxAMI := aws.GetAmazonLinuxAmi(t, awsRegion)
ubuntuAMI      := aws.GetUbuntu2004Ami(t, awsRegion)
```

### EC2 instance type selection

```go
// Pick the first available instance type in the given region
instanceType := aws.GetRecommendedInstanceType(t, awsRegion,
    []string{"t3.micro", "t2.micro", "t3.small"},
)
```

### S3 bucket checks

```go
bucketID := terraform.Output(t, terraformOptions, "bucket_id")

// Assert the bucket exists
aws.AssertS3BucketExists(t, awsRegion, bucketID)

// Check versioning status: returns "Enabled", "Suspended", or ""
versioningStatus := aws.GetS3BucketVersioning(t, awsRegion, bucketID)
assert.Equal(t, "Enabled", versioningStatus)

// Assert a bucket policy is attached (non-empty)
aws.AssertS3BucketPolicyExists(t, awsRegion, bucketID)

// Get the raw policy JSON
policyJSON := aws.GetS3BucketPolicy(t, awsRegion, bucketID)
assert.Contains(t, policyJSON, "aws:SecureTransport")

// Check server access logging configuration
loggingTarget := aws.GetS3BucketLoggingTarget(t, awsRegion, bucketID)
loggingPrefix := aws.GetS3BucketLoggingTargetPrefix(t, awsRegion, bucketID)
assert.Equal(t, bucketID+"-logs", loggingTarget)
assert.Equal(t, "access-logs/", loggingPrefix)

// Read and write objects
aws.PutS3ObjectContents(t, awsRegion, bucketID, "test-key", strings.NewReader("hello"))
contents := aws.GetS3ObjectContents(t, awsRegion, bucketID, "test-key")
assert.Equal(t, "hello", contents)
```

### EC2 queries

```go
instanceID := terraform.Output(t, terraformOptions, "instance_id")

publicIP  := aws.GetPublicIpOfEc2Instance(t, instanceID, awsRegion)
privateIP := aws.GetPrivateIpOfEc2Instance(t, instanceID, awsRegion)

// Find instances by tag
instanceIDs := aws.GetEc2InstanceIdsByTag(t, awsRegion, "Name", "my-web-server")

// Get instance tags
tags := aws.GetTagsForEc2Instance(t, awsRegion, instanceID)
assert.Equal(t, "production", tags["Environment"])
```

### Other AWS services

```go
// Lambda invocation
result := aws.InvokeFunction(t, awsRegion, "my-function", map[string]string{"key": "value"})

// SSM Parameter Store
aws.PutParameter(t, awsRegion, "/myapp/db_url", "Database URL", "postgres://localhost/db")
value := aws.GetParameter(t, awsRegion, "/myapp/db_url")

// Secrets Manager
secretARN := aws.CreateSecretStringWithDefaultKey(t, awsRegion, "Test secret", "my-secret", `{"password":"abc123"}`)
defer aws.DeleteSecret(t, awsRegion, secretARN, true)
secretValue := aws.GetSecretValue(t, awsRegion, secretARN)
```

## The retry Package

Terratest's `retry` package gives you explicit retry control independent of any specific infrastructure helper.

### DoWithRetry

```go
import (
    "time"
    "github.com/gruntwork-io/terratest/modules/retry"
)

result := retry.DoWithRetry(
    t,
    "wait for database to be ready",  // description for log messages
    20,                                // max retries
    15*time.Second,                    // sleep between retries
    func() (string, error) {
        // Attempt the operation
        err := pingDatabase(dbHost, dbPort)
        if err != nil {
            return "", fmt.Errorf("database not ready: %w", err)
        }
        return "ready", nil
    },
)
t.Logf("Database status: %s", result)
```

If the action returns any non-nil error, Terratest sleeps and retries. If all retries are exhausted, the test fails.

### FatalError: skip retrying

```go
result := retry.DoWithRetry(t, "check endpoint", 10, 5*time.Second, func() (string, error) {
    status, body, err := http_helper.HttpGetE(t, url, nil)
    if err != nil {
        return "", err // retryable — network error
    }
    if status == 404 {
        // Not-found is a permanent failure — no point retrying
        return "", retry.FatalError{Underlying: fmt.Errorf("got 404 for %s", url)}
    }
    if status != 200 {
        return "", fmt.Errorf("unexpected status %d", status) // retryable
    }
    return body, nil
})
```

### DoWithRetryE

When you want to handle the "all retries exhausted" case yourself rather than failing the test:

```go
result, err := retry.DoWithRetryE(t, "check health", 5, 10*time.Second, func() (string, error) {
    return checkHealth()
})
if err != nil {
    t.Logf("Health check never passed: %v", err)
    // custom handling instead of immediate test failure
}
```

### DoWithRetryableErrors

Retry only on specific error patterns (regex-matched):

```go
result := retry.DoWithRetryableErrors(
    t,
    "apply terraform",
    map[string]string{
        ".*connection reset by peer.*":  "Transient network error",
        ".*timeout.*":                   "Timeout, will retry",
    },
    5,
    30*time.Second,
    func() (string, error) {
        return terraform.InitAndApplyE(t, terraformOptions)
    },
)
```

Errors not matching any pattern are immediately wrapped in `FatalError` and the test fails without retrying.

### Background polling

```go
// Poll continuously in the background while other test steps run
done := retry.DoInBackgroundUntilStopped(t, "monitor health", 10*time.Second, func() {
    status, _, _ := http_helper.HttpGetE(t, healthURL, nil)
    t.Logf("Health check status: %d", status)
})

// ... run other test steps ...

done() // stop the background goroutine
```

## The test_structure Package

Long-running infrastructure tests are painful to iterate on. If your test takes 20 minutes and fails in the validation step, you don't want to re-deploy from scratch every time. The `test_structure` package solves this by splitting a test into named stages that can be skipped independently.

### RunTestStage with SKIP_ environment variables

```go
import testStructure "github.com/gruntwork-io/terratest/modules/test-structure"

func TestMyModule(t *testing.T) {
    t.Parallel()

    workingDir := "../examples/my-module"

    // STAGE 1: deploy
    testStructure.RunTestStage(t, "deploy", func() {
        awsRegion := aws.GetRandomStableRegion(t, nil, nil)

        terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
            TerraformDir: workingDir,
            Vars: map[string]interface{}{
                "region": awsRegion,
            },
        })

        // Save state so later stages can load it
        testStructure.SaveTerraformOptions(t, workingDir, terraformOptions)
        testStructure.SaveString(t, workingDir, "awsRegion", awsRegion)

        terraform.InitAndApply(t, terraformOptions)
    })

    // STAGE 2: validate
    testStructure.RunTestStage(t, "validate", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        awsRegion        := testStructure.LoadString(t, workingDir, "awsRegion")

        bucketID := terraform.Output(t, terraformOptions, "bucket_id")
        aws.AssertS3BucketExists(t, awsRegion, bucketID)
    })

    // STAGE 3: teardown
    testStructure.RunTestStage(t, "teardown", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        terraform.Destroy(t, terraformOptions)
    })
}
```

To skip the deploy and teardown stages and re-run only validation:

```bash
SKIP_deploy=true SKIP_teardown=true go test -v -run TestMyModule -timeout 30m
```

`RunTestStage` checks for a `SKIP_<stageName>` environment variable. If it is set to any non-empty value, the stage body is skipped.

### Saving and loading test data

```go
// Save and load TerraformOptions (serialized to JSON in workingDir)
testStructure.SaveTerraformOptions(t, workingDir, terraformOptions)
terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)

// Save and load arbitrary strings
testStructure.SaveString(t, workingDir, "awsRegion", "us-east-1")
region := testStructure.LoadString(t, workingDir, "awsRegion")

// Save and load integers
testStructure.SaveInt(t, workingDir, "port", 8080)
port := testStructure.LoadInt(t, workingDir, "port")

// Save and load EC2 key pairs
testStructure.SaveEc2KeyPair(t, workingDir, keyPair)
keyPair := testStructure.LoadEc2KeyPair(t, workingDir)
```

Data is written as JSON files inside `workingDir`. The file path format is `<workingDir>/.test-data/<name>.json`.

### CopyTerraformFolderToTemp

When running multiple tests in parallel that share the same Terraform directory, they will conflict over `.terraform/` and `terraform.tfstate`. The solution is to copy the module to a temp directory per test:

```go
rootFolder               := ".."
terraformFolderRelativeToRoot := "examples/my-module"

// Copies the entire repo to a temp dir, returns path to the module inside it
tempTestFolder := testStructure.CopyTerraformFolderToTemp(t, rootFolder, terraformFolderRelativeToRoot)

terraformOptions := &terraform.Options{
    TerraformDir: tempTestFolder,
}
```

When any `SKIP_*` variable is set, `CopyTerraformFolderToTemp` skips the copy and returns the original path — preserving cached state between iterative runs.

## Parallel Tests

Running tests in parallel dramatically reduces total CI time when you have multiple independent modules to test.

### t.Parallel()

```go
func TestModuleA(t *testing.T) {
    t.Parallel() // this test runs concurrently with other parallel tests
    // ...
}

func TestModuleB(t *testing.T) {
    t.Parallel()
    // ...
}
```

### Namespacing to avoid collisions

When tests run in parallel in the same AWS account, resource names must be unique:

```go
import "github.com/gruntwork-io/terratest/modules/random"

uniqueID   := random.UniqueId() // 6-character random alphanumeric string
bucketName := fmt.Sprintf("my-test-bucket-%s", strings.ToLower(uniqueID))
```

`random.UniqueId()` generates a short random string suitable for resource name suffixes.

### Subtests with parallel table-driven tests

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
        tc := tc // capture range variable
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()

            uniqueID   := random.UniqueId()
            awsRegion  := aws.GetRandomStableRegion(t, nil, nil)
            bucketName := fmt.Sprintf("test-%s-%s", tc.name, strings.ToLower(uniqueID))

            terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
                TerraformDir: "../examples/s3-module",
                Vars: map[string]interface{}{
                    "bucket_name": bucketName,
                    "region":      awsRegion,
                    "with_policy": tc.withPolicy,
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

Each subtest runs in parallel, deploying its own isolated bucket.

## Practical Example: Testing an S3 Module End-to-End

This is a complete, runnable example testing a Terraform S3 module with versioning, bucket policy, and server access logging.

### The Terraform module (examples/s3-module/main.tf)

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

### The test (test/s3_module_test.go)

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

    // Copy the module to a temp folder to avoid state conflicts with parallel tests
    workingDir := testStructure.CopyTerraformFolderToTemp(t, "..", "examples/s3-module")

    // -----------------------------------------------------------------------
    // STAGE: deploy
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
    // STAGE: validate
    // -----------------------------------------------------------------------
    testStructure.RunTestStage(t, "validate", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        awsRegion        := testStructure.LoadString(t, workingDir, "awsRegion")

        // Read outputs
        bucketID   := terraform.Output(t, terraformOptions, "bucket_id")
        logsBucket := terraform.Output(t, terraformOptions, "logs_bucket")

        require.NotEmpty(t, bucketID)
        require.NotEmpty(t, logsBucket)

        // Verify the bucket exists
        aws.AssertS3BucketExists(t, awsRegion, bucketID)

        // Verify versioning is enabled
        versioningStatus := aws.GetS3BucketVersioning(t, awsRegion, bucketID)
        assert.Equal(t, "Enabled", versioningStatus)

        // Verify bucket policy is attached
        aws.AssertS3BucketPolicyExists(t, awsRegion, bucketID)

        // Verify the policy content contains the TLS deny statement
        policy := aws.GetS3BucketPolicy(t, awsRegion, bucketID)
        assert.Contains(t, policy, "aws:SecureTransport")

        // Verify server access logging target
        loggingTarget := aws.GetS3BucketLoggingTarget(t, awsRegion, bucketID)
        loggingPrefix := aws.GetS3BucketLoggingTargetPrefix(t, awsRegion, bucketID)
        assert.Equal(t, logsBucket, loggingTarget)
        assert.Equal(t, "access-logs/", loggingPrefix)

        // Verify we can write and read objects (round-trip test)
        testKey     := "test-objects/hello.txt"
        testContent := "hello from terratest"
        aws.PutS3ObjectContents(t, awsRegion, bucketID, testKey, strings.NewReader(testContent))

        // Use retry to handle eventual consistency
        retry.DoWithRetry(t, "read S3 object", 5, 3*time.Second, func() (string, error) {
            contents := aws.GetS3ObjectContents(t, awsRegion, bucketID, testKey)
            if contents != testContent {
                return "", fmt.Errorf("expected %q, got %q", testContent, contents)
            }
            return contents, nil
        })
    })

    // -----------------------------------------------------------------------
    // STAGE: teardown
    // -----------------------------------------------------------------------
    testStructure.RunTestStage(t, "teardown", func() {
        terraformOptions := testStructure.LoadTerraformOptions(t, workingDir)
        terraform.Destroy(t, terraformOptions)
    })
}
```

### Running the test

```bash
# Full run
go test -v -run TestS3Module -timeout 30m

# Re-run only the validate stage (deploy already done)
SKIP_deploy=true SKIP_teardown=true go test -v -run TestS3Module -timeout 10m

# Re-run validate and teardown (skip deploy)
SKIP_deploy=true go test -v -run TestS3Module -timeout 30m
```

## Practical Example: EC2 + HTTP Validation

This example deploys an EC2 instance that serves a web page, then validates the HTTP response.

```go
func TestEC2WebServer(t *testing.T) {
    t.Parallel()

    awsRegion    := aws.GetRandomStableRegion(t, nil, nil)
    uniqueID     := random.UniqueId()
    instanceName := fmt.Sprintf("terratest-web-%s", strings.ToLower(uniqueID))
    responseText := fmt.Sprintf("Hello from %s", uniqueID)

    // Pick an available instance type for the chosen region
    instanceType := aws.GetRecommendedInstanceType(t, awsRegion,
        []string{"t3.micro", "t2.micro", "t3.small"},
    )

    // Get a recent Amazon Linux 2 AMI
    amiID := aws.GetMostRecentAmiId(t, awsRegion, "amazon", map[string][]string{
        "name":                {"amzn2-ami-hvm-*-x86_64-gp2"},
        "virtualization-type": {"hvm"},
    })

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../examples/ec2-web",
        Vars: map[string]interface{}{
            "aws_region":     awsRegion,
            "ami_id":         amiID,
            "instance_type":  instanceType,
            "instance_name":  instanceName,
            "response_text":  responseText,
        },
        NoColor: true,
    })

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    instanceURL := terraform.Output(t, terraformOptions, "instance_url")

    // Wait up to 5 minutes for the server to come up
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

## Error Handling Conventions

Every Terratest function follows the same convention:

- `terraform.InitAndApply(t, opts)` — calls `t.Fatal()` on error, test stops immediately.
- `terraform.InitAndApplyE(t, opts)` — returns `(string, error)`, you decide what to do.

The plain variants are appropriate for most tests because failing fast and loud is correct behaviour when a deployment breaks. Use the `E` variants when you need conditional logic or when you expect partial failures and want to continue.

```go
// Expecting a plan to fail (e.g., testing that invalid input is rejected)
_, err := terraform.InitAndPlanE(t, terraformOptions)
require.Error(t, err, "expected plan to fail with invalid configuration")

// Checking whether a resource exists before asserting on it
exists := aws.GetS3BucketVersioning(t, awsRegion, bucketID)
if exists == "" {
    t.Log("Versioning not configured — checking if it was intentionally disabled")
}
```

## Summary

Terratest covers the entire testing surface for Terraform modules:

| Package | What it does |
|---|---|
| `terraform` | Wraps the Terraform CLI: init, apply, plan, destroy, outputs |
| `http_helper` | HTTP GET with retry and custom validation functions |
| `aws` | AWS SDK wrappers: S3, EC2, AMI, RDS, Lambda, SSM, Secrets Manager |
| `retry` | Generic retry logic with timeout, fatal errors, and retryable error patterns |
| `test_structure` | Stage-based test execution with persistent state between stages |
| `random` | Unique ID generation for resource namespacing |

The fundamental workflow never changes: `defer Destroy`, then `InitAndApply`, then assert. Everything else is composing those building blocks with retry logic, AWS API calls, and HTTP checks to cover the specific behaviour your module promises to deliver.

## References

- [Terratest Official Website](https://terratest.gruntwork.io/)
- [Terratest GitHub Repository](https://github.com/gruntwork-io/terratest)
- [Terratest Official Documentation](https://terratest.gruntwork.io/docs/)
- [Go Testing Package Documentation](https://pkg.go.dev/testing)
- [testify: Go Assertion Library](https://github.com/stretchr/testify)
- [Gruntwork Blog: Terraform Testing Strategies](https://blog.gruntwork.io/)
