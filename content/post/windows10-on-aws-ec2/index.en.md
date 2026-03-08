---
title: How to Install Windows 10 on AWS EC2 via VM Import
description: 'Build a Windows 10 VHD in VirtualBox, import it to AWS as an AMI using VM Import, and launch an EC2 instance. Covers IAM role setup, S3 upload, and RDP login.'
slug: running-windows10-on-aws-ec2
date: '2020-07-04T11:34:00+08:00'
categories:
  - Windows
  - DevOps
tags:
  - Windows
  - AWS
draft: false
image: featured.jpg
---

## Prerequisites

AWS VM Import supports the following Windows 10 editions: Professional, Enterprise, and Education (64-bit, English). Home edition is not supported.

You can download the Enterprise trial from the [Microsoft website](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-10-enterprise).

## Create the Virtual Machine

1. Create a new VM in VirtualBox with VHD, VMDK, or OVA disk format (about 20GB for the system disk)
2. Install Windows 10 -- make sure to set an administrator password (otherwise you won't be able to connect via Remote Desktop later)
3. Install TeamViewer, configure Easy Access, and enable LAN connections and Windows login
4. Enable Remote Desktop (Start -> Allow remote access)
5. Install [EC2 Configure Service](http://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/UsingConfig_Install.html)
6. Reboot, wait for Windows Update to finish, then shut down

## Install AWS CLI

```bash
sudo apt install awscli
aws configure
```

Set up your Access Key, Secret Key, and default Region. Note that P2 instances are only available in US regions.

## Upload the Image

Create an S3 bucket (the name must be globally unique):

```bash
aws s3 mb s3://your-bucket-name --region eu-central-1
```

Upload the VHD file:

```bash
aws s3 cp codexaws.vhd s3://your-bucket-name --region eu-central-1
```

## Set Up IAM Role

Create `trust-policy.json`:

```json
{
   "Version": "2012-10-17",
   "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "vmie.amazonaws.com" },
      "Action": "sts:AssumeRole",
      "Condition": {
         "StringEquals": { "sts:Externalid": "vmimport" }
      }
   }]
}
```

Create the role:

```bash
aws iam create-role --role-name vmimport --assume-role-policy-document file://trust-policy.json
```

Create `role-policy.json`, replacing `YOUR-BUCKET-NAME` with your actual bucket name (same one used above):

```json
{
   "Version": "2012-10-17",
   "Statement": [
      {
         "Effect": "Allow",
         "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
         "Resource": ["arn:aws:s3:::YOUR-BUCKET-NAME"]
      },
      {
         "Effect": "Allow",
         "Action": ["s3:GetObject"],
         "Resource": ["arn:aws:s3:::YOUR-BUCKET-NAME/*"]
      },
      {
         "Effect": "Allow",
         "Action": ["ec2:ModifySnapshotAttribute", "ec2:CopySnapshot", "ec2:RegisterImage", "ec2:Describe*"],
         "Resource": "*"
      }
   ]
}
```

Attach the policy:

```bash
aws iam put-role-policy --role-name vmimport --policy-name vmimport --policy-document file://role-policy.json
```

## Import the Image

Create `containers.json`:

```json
[{
  "Description": "Windows 10 Base Install",
  "Format": "vhd",
  "UserBucket": {
    "S3Bucket": "your-bucket-name",
    "S3Key": "codexaws.vhd"
  }
}]
```

Run the import:

```bash
aws ec2 import-image --description "Windows 10" --disk-containers file://containers.json --region eu-central-1
```

Check progress:

```bash
aws ec2 describe-import-image-tasks --region eu-central-1
```

## Launch the EC2 Instance

After the import completes, go to the EC2 Console:

1. **Images -> AMI** -> right-click -> Launch
2. Choose a g2 instance type (you may need to request a limit increase from AWS first)
3. Open RDP and TeamViewer ports in the Security Group
4. Once launched, use "Connect" to download the RDP file and log in with the credentials you set earlier

## Post-Installation Setup

- Re-link your TeamViewer account
- Install NVIDIA drivers
- Follow the documentation to enable [ENA Enhanced Networking](https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/enhanced-networking.html#supported_instances)
