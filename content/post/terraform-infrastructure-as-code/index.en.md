---
title: 'Terraform: Manage Cloud Infrastructure as Code, Stop Clicking Around'
date: '2026-03-14T09:00:00+08:00'
slug: terraform-infrastructure-as-code
description: 'Terraform is an Infrastructure as Code tool that manages AWS, GCP, Cloudflare and 3000+ providers with HCL. Covers installation, HCL syntax, state management, module structure, multi-environment strategy, and a working S3+CloudFront deployment example.'
categories:
  - DevOps
tags:
  - terraform
  - infrastructure-as-code
  - aws
  - devops
  - cloudflare
---

Every time you set up a new environment, you click through the cloud console one resource at a time. Three months later a colleague asks how it was built — and you've forgotten yourself.
Staging and prod silently diverge until something breaks.
[Terraform](https://www.terraform.io/) describes all of it in code. `plan` previews changes, `apply` executes them. There's a git history, it's reviewable, and it can be rolled back.

## Installation

Use [tfenv](https://github.com/tfutils/tfenv) to manage versions — same concept as nvm:

```bash
# macOS
brew install tfenv

# Install and switch to a specific version
tfenv install 1.10.5
tfenv use 1.10.5

# Pin version per project — tfenv reads this file automatically when you cd in
echo "1.10.5" > .terraform-version
```

If you don't need version management, install directly via Homebrew:

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform --version
```

## HCL Syntax Basics

Terraform uses HCL (HashiCorp Configuration Language) in `.tf` files. Declarative syntax — you describe what you want, not how to get it.

### Resource: Create Cloud Resources

```hcl
# Format: resource "provider_type" "local_name" { ... }
resource "aws_s3_bucket" "website" {
  bucket = "my-website-2026"

  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# Reference another resource's attributes — creates an implicit dependency
resource "aws_s3_bucket_versioning" "website" {
  bucket = aws_s3_bucket.website.id  # format: type.name.attribute

  versioning_configuration {
    status = "Enabled"
  }
}
```

### Variable: Input Parameters

```hcl
variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod."
  }
}

variable "instance_count" {
  type    = number
  default = 1
}

variable "db_password" {
  type      = string
  sensitive = true  # redacted from CLI output and logs
}
```

Ways to provide values (highest to lowest precedence):

```bash
# 1. CLI flag
terraform apply -var="environment=prod"

# 2. Var file flag
terraform apply -var-file="prod.tfvars"

# 3. terraform.tfvars (auto-loaded)
# 4. Environment variable
export TF_VAR_environment=prod

# 5. Default in the variable block
```

`terraform.tfvars` example:

```hcl
environment    = "prod"
instance_count = 3
```

### Output: Export Values

```hcl
output "bucket_name" {
  value       = aws_s3_bucket.website.id
  description = "The S3 bucket name"
}

output "bucket_arn" {
  value = aws_s3_bucket.website.arn
}
```

```bash
terraform output bucket_name  # read a single output
terraform output              # read all outputs
```

### Locals: Computed Values

Locals are named expressions reused within the configuration — not user inputs:

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
  bucket = local.bucket_name   # reference with local.<name>
  tags   = local.common_tags
}
```

### Data Source: Read Existing Resources

Data sources are read-only queries for infrastructure not managed by this Terraform configuration:

```hcl
# Look up the latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

# Reference with data.type.name.attribute
resource "aws_instance" "app" {
  ami           = data.aws_ami.amazon_linux.id
  instance_type = "t3.micro"
}
```

## Core Workflow

```bash
# Initialize: download provider plugins, create .terraform/ directory
terraform init

# Preview: shows what WOULD happen, doesn't execute
# + create  - destroy  ~ update  +/- destroy and recreate
terraform plan

# Apply: execute changes (prompts for confirmation)
terraform apply

# Save plan then apply (common in CI/CD)
terraform plan -out=tfplan
terraform apply tfplan

# Skip confirmation prompt (CI/CD pipelines)
terraform apply -auto-approve

# Other useful commands
terraform fmt           # format all .tf files in place
terraform validate      # check syntax
terraform state list    # list all resources in state
terraform destroy       # tear down all resources
```

## Provider Configuration

Providers are plugins that connect to cloud platforms:

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
  # Credentials from env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
```

CloudFront requires ACM certificates in us-east-1. Use a provider alias:

```hcl
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_acm_certificate" "cert" {
  provider          = aws.us_east_1  # specify the alias
  domain_name       = "example.com"
  validation_method = "DNS"
}
```

## State Management

Terraform uses `terraform.tfstate` to track what resources it created, their IDs and attributes. This file is the core of how Terraform operates.

**Important: state can contain plaintext passwords and private keys — never commit it to git.**

```gitignore
# .gitignore
*.tfstate
*.tfstate.backup
.terraform/
terraform.tfvars

# DO commit this — it pins provider versions
# .terraform.lock.hcl
```

### Remote State (Required for Teams)

Local state doesn't support collaboration. Store state in S3:

```hcl
# Create the state bucket first (run this once)
resource "aws_s3_bucket" "tf_state" {
  bucket = "my-company-terraform-state"
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"  # keeps state file history for rollback
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

Configure the backend in your main project:

```hcl
terraform {
  backend "s3" {
    bucket       = "my-company-terraform-state"
    key          = "prod/web-app/terraform.tfstate"  # path within the bucket
    region       = "ap-northeast-1"
    use_lockfile = true  # Terraform 1.10+ S3 native locking, no DynamoDB needed
  }
}
```

`use_lockfile = true` was added in Terraform 1.10. It uses S3 conditional writes for state locking, preventing two concurrent `apply` runs from corrupting state. Previously you needed a separate DynamoDB table — that approach is now deprecated.

## Modules: Reusable Configuration

Modules package Terraform resources so different environments can share them.

### Standard Directory Layout

```
modules/
  s3-website/
    main.tf       # resource definitions
    variables.tf  # input variable declarations
    outputs.tf    # output declarations
    versions.tf   # provider versions

environments/
  dev/
    main.tf       # calls modules with dev-specific values
    backend.tf
    terraform.tfvars
  prod/
    main.tf
    backend.tf
    terraform.tfvars
```

### Writing a Module

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

### Calling a Module

```hcl
# environments/prod/main.tf
module "website" {
  source = "../../modules/s3-website"  # relative path for local modules

  bucket_name = "my-company-website-prod"
  environment = "prod"
}

output "website_bucket" {
  value = module.website.bucket_id  # access module output
}
```

Public modules from the Terraform Registry:

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "main-vpc"
  cidr = "10.0.0.0/16"
  azs  = ["ap-northeast-1a", "ap-northeast-1c"]
}
```

## Multi-Environment Strategy

Two common approaches:

**Workspaces**: Same configuration, separate state files. Good for small teams where environments are nearly identical.

```bash
terraform workspace new dev
terraform workspace new prod
terraform workspace select prod
```

**Separate directories** (recommended): Each environment is a completely independent Terraform root with its own backend and state. Better when prod needs strict access control.

```
environments/
  dev/   ← run terraform init / plan / apply here
  prod/  ← independent state, independent permissions
```

## Practical Example: S3 + CloudFront Static Website

This example deploys a private S3 bucket with a CloudFront distribution using OAC (Origin Access Control) — the modern replacement for OAI.

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

# CloudFront + ACM certificates must be in us-east-1
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

# ── S3 Bucket (private — CloudFront reads via OAC) ──
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

# ── CloudFront OAC (replaces legacy OAI) ──
resource "aws_cloudfront_origin_access_control" "website" {
  name                              = "${var.bucket_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Bucket Policy: allow CloudFront only ──
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

# ── ACM Certificate (must be in us-east-1) ──
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
  price_class         = "PriceClass_100"  # US + Europe, cost-effective
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

    default_ttl = 86400    # 1 day
    max_ttl     = 31536000 # 1 year
  }

  # SPA: redirect 404/403 to index.html
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

Deploy and upload:

```bash
terraform init
terraform plan
terraform apply

# Upload static files
aws s3 sync ./dist s3://$(terraform output -raw bucket_name) --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw cloudfront_id) \
  --paths "/*"
```

## Common Pitfalls

**State contains sensitive data**: State stores all resource attributes, including plaintext passwords. `sensitive = true` only hides values in CLI output — they're still written to state. Use a remote backend with encryption. Never use local state for production.

**Configuration drift**: Someone makes a manual change in the console, Terraform doesn't know about it. Run `terraform plan -refresh-only` to detect drift without touching real infrastructure.

**Importing existing resources**: Use the `import` block (Terraform 1.5+) to bring existing resources under Terraform management:

```hcl
import {
  to = aws_s3_bucket.legacy
  id = "my-existing-bucket-name"
}
```

Then run `terraform plan -generate-config-out=generated.tf` to auto-generate the resource block. Review it, move it into your config, and `terraform apply`.

**Lifecycle protection**: Add `prevent_destroy` to critical resources to prevent accidental deletion:

```hcl
resource "aws_s3_bucket" "data" {
  bucket = "critical-data"

  lifecycle {
    prevent_destroy = true  # terraform destroy will error and stop
  }
}
```

**Lock provider versions**: Without version constraints, `terraform init` installs the latest version, which may include breaking changes. Commit `.terraform.lock.hcl` to git so the whole team uses the same provider versions.

## Summary

Terraform turns infrastructure into code that can be reviewed, version-controlled, and reused. `plan` shows you exactly what will happen before it happens. `state` lets Terraform know the current reality. `module` lets you share configurations across environments without copy-pasting.

Start small — import one existing resource, wrap it in code, and build from there. Every resource you move out of ClickOps becomes a change you can track in git.
