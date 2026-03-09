---
title: 'terraform test: The Built-in Terraform Module Testing Framework, No Go Required'
date: '2026-03-15T09:00:00+08:00'
slug: terraform-test
image: featured.jpg
description: 'Terraform 1.6 ships a built-in test framework. Write tests in .tftest.hcl, run with terraform test. Supports plan-only unit tests, mock_provider without cloud credentials, expect_failures for validation testing, and apply-based integration tests.'
categories:
  - DevOps
tags:
  - terraform
  - testing
  - infrastructure-as-code
  - devops
---

You've written a Terraform module. How do you verify the variable validation rules work? That versioning gets enabled when the flag is set? That tags are passed through correctly?
Before, you either squinted at `terraform plan` output or wrote Terratest in Go.
Since Terraform 1.6, there's a built-in testing framework. Write tests in HCL, run with `terraform test`. No Go, no extra tools.

## Two Testing Modes

`terraform test` supports two modes:

- **Plan-only (unit tests)**: `command = plan` with `mock_provider` — no cloud credentials needed, purely validates the plan output
- **Apply (integration tests)**: `command = apply` — creates real resources, auto-destroys when the test finishes

This article uses an S3 bucket module as the example, covering both unit and integration tests.

## Module Structure

```
s3-bucket-module/
├── main.tf
├── variables.tf
├── outputs.tf
└── tests/
    ├── setup/           # shared infrastructure for integration tests
    │   ├── main.tf
    │   └── outputs.tf
    ├── unit.tftest.hcl         # plan + mock, no credentials needed
    └── integration.tftest.hcl  # apply, creates real resources
```

### The Module

```hcl
# variables.tf
variable "bucket_name" {
  type = string

  validation {
    condition     = length(var.bucket_name) >= 3 && length(var.bucket_name) <= 63
    error_message = "Bucket name must be between 3 and 63 characters."
  }

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.bucket_name))
    error_message = "Bucket name must use only lowercase letters, numbers, hyphens, and dots."
  }
}

variable "environment" {
  type = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
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

## Unit Tests: mock_provider + plan

Terraform 1.7 introduced `mock_provider`, which lets you test without any AWS credentials. Terraform generates synthetic resource attribute values. Use `mock_resource` to specify values for specific attributes.

```hcl
# tests/unit.tftest.hcl

# Mock the AWS provider — no real API calls
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

# File-level variables — applied to all run blocks unless overridden
variables {
  environment   = "dev"
  force_destroy = true
}
```

### assert: Validate the Plan Output

```hcl
run "versioning_enabled_when_variable_is_true" {
  command = plan

  variables {
    bucket_name       = "my-app-dev-assets"
    enable_versioning = true
  }

  assert {
    condition     = aws_s3_bucket.main.bucket == "my-app-dev-assets"
    error_message = "Bucket name was not set correctly."
  }

  assert {
    condition     = aws_s3_bucket.main.tags["Environment"] == "dev"
    error_message = "Environment tag must be 'dev'."
  }

  assert {
    condition     = aws_s3_bucket.main.tags["ManagedBy"] == "terraform"
    error_message = "ManagedBy tag must be 'terraform'."
  }

  assert {
    condition     = aws_s3_bucket_versioning.main.versioning_configuration[0].status == "Enabled"
    error_message = "Versioning should be Enabled when enable_versioning is true."
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
    error_message = "Versioning should be Suspended when enable_versioning is false."
  }
}

run "encryption_always_aes256" {
  command = plan

  variables {
    bucket_name = "my-app-dev-data"
  }

  assert {
    condition     = aws_s3_bucket_server_side_encryption_configuration.main.rule[0].apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "Encryption algorithm must be AES256."
  }
}
```

### expect_failures: Test Validation Rules

`expect_failures` tests that certain inputs are correctly rejected:

```hcl
run "bucket_name_too_short" {
  command = plan

  variables {
    bucket_name = "ab"  # only 2 characters — should fail validation
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
    environment = "production"  # not in the allowed list
  }

  expect_failures = [
    var.environment,
  ]
}
```

`expect_failures` accepts:
- `var.name` — variable validation blocks
- `resource.type.name` — resource lifecycle preconditions/postconditions
- `output.name` — output preconditions
- `check.name` — check blocks

## Integration Tests: Real Apply

Integration tests create actual AWS resources. Terraform auto-destroys them when the test completes. Real credentials required.

### Setup Module: Unique Bucket Names

Running tests multiple times causes name collisions. A setup module generates a random suffix:

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

### Integration Test File

```hcl
# tests/integration.tftest.hcl

provider "aws" {
  region = "us-east-1"
}

variables {
  environment   = "dev"
  force_destroy = true  # required for cleanup to work
}

# Run setup first to generate a unique prefix
run "setup" {
  module {
    source = "./setup"
  }
}

# Reference the previous run's output with run.setup.test_prefix
run "create_basic_bucket" {
  command = apply

  variables {
    bucket_name       = "${run.setup.test_prefix}-basic"
    enable_versioning = false
  }

  assert {
    condition     = aws_s3_bucket.main.id == "${run.setup.test_prefix}-basic"
    error_message = "Bucket ID doesn't match the expected name."
  }

  assert {
    condition     = can(regex("^arn:aws:s3:::", aws_s3_bucket.main.arn))
    error_message = "Bucket ARN format is unexpected: ${aws_s3_bucket.main.arn}"
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
    error_message = "Versioning should be Enabled."
  }

  assert {
    condition     = output.bucket_arn != ""
    error_message = "bucket_arn output must not be empty."
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
    error_message = "Environment tag should be 'staging'."
  }

  assert {
    condition     = aws_s3_bucket.main.tags["ManagedBy"] == "terraform"
    error_message = "ManagedBy tag must be 'terraform'."
  }
}
```

Each `run` block has its own state. Resources aren't destroyed after each run — they're all destroyed together at the end of the test file, in reverse order (last created, first destroyed).

## Running Tests

```bash
# Run all tests (unit + integration)
terraform test

# Unit tests only (fast, no credentials)
terraform test -filter=tests/unit.tftest.hcl

# Integration tests only
terraform test -filter=tests/integration.tftest.hcl

# Verbose output (shows plan/state per run block)
terraform test -verbose

# JSON output for CI parsing
terraform test -json

# JUnit XML for CI dashboards (GitHub Actions, Jenkins)
terraform test -junit-xml=test-results.xml

# Override a variable
terraform test -var="environment=staging"
```

Example output:

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

## Variable Precedence

Variable priority in test files follows the same rules as regular Terraform:

| Priority | Source |
|----------|--------|
| Highest | `variables {}` inside a `run` block |
| ↓ | CLI `-var` and `-var-file` flags |
| ↓ | `.auto.tfvars` files |
| ↓ | `terraform.tfvars` |
| ↓ | `TF_VAR_*` environment variables |
| ↓ | File-level `variables {}` block in `.tftest.hcl` |
| Lowest | Variable `default` values |

## terraform test vs Terratest

| | terraform test | [Terratest](/en/p/terratest-infrastructure-testing/) |
|--|--|--|
| Language | HCL | Go |
| Requirement | Terraform 1.6+ | Go 1.21+ |
| Mock support | ✓ (mock_provider, v1.7+) | ✗ (real resources required) |
| Unit tests | ✓ | Difficult |
| Integration tests | ✓ | ✓ (more flexible) |
| HTTP validation | ✗ | ✓ (http_helper) |
| Complex validation logic | Limited (HCL expressions) | Full (Go code) |
| Learning curve | Low (already know HCL) | Medium (need Go) |
| CI integration | `-junit-xml` | `go test -v` |

**Choose `terraform test`** when: validating module variable rules, checking resource attribute values, no complex validation logic needed.

**Choose Terratest** when: you need HTTP request validation, complex retry logic, or cross-service integration testing.

## Summary

The biggest advantage of `terraform test` is zero barrier to entry — you're already writing HCL, so you can write tests. `mock_provider` lets CI run unit tests without cloud credentials. `expect_failures` makes variable validation rules automatically verifiable, not just something you manually check.

Start with unit tests. Write tests for the validation rules in your existing modules. That way, future changes can't silently break expected behavior.

## References

- [Terraform Tests Official Documentation](https://developer.hashicorp.com/terraform/language/tests)
- [Terraform mock_provider Documentation (v1.7+)](https://developer.hashicorp.com/terraform/language/tests/mocking)
- [Terraform Official Documentation](https://developer.hashicorp.com/terraform/docs)
- [JUnit XML Test Report Format](https://www.ibm.com/docs/en/developer-for-zos/14.1?topic=formats-junit-xml-format)
