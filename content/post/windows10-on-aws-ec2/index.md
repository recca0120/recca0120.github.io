---
title: 在 AWS EC2 上安裝 Windows 10
slug: running-windows10-on-aws-ec2
date: '2020-07-04T11:34:00+08:00'
categories:
- aws
tags:
- aws - virtualbox - windows10
draft: false
image: featured.png
---

## 前置準備

AWS VM Import 支援的 Windows 10 版本：Professional、Enterprise、Education（64-bit，英文版）。Home 版不行。

Enterprise 試用版可以在 [Microsoft 官網](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-10-enterprise)下載。

## 建立虛擬機

1. 用 VirtualBox 建一台新的虛擬機，磁碟格式選 VHD、VMDK 或 OVA（系統碟大約 20GB）
2. 安裝 Windows 10，記得設管理員密碼（不然之後遠端桌面連不進去）
3. 安裝 TeamViewer，設定 Easy Access，開啟 LAN 連線和 Windows 登入
4. 開啟遠端桌面（開始 → 允許遠端存取）
5. 安裝 [EC2 Configure Service](http://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/UsingConfig_Install.html)
6. 重開機，等 Windows Update 跑完，再關機

## 安裝 AWS CLI

```bash
sudo apt install awscli
aws configure
```

設定 Access Key、Secret Key 和預設 Region。注意 P2 執行個體只在美國區域有。

## 上傳映像檔

建立 S3 bucket（名稱要全域唯一）：

```bash
aws s3 mb s3://你的bucket名稱 --region eu-central-1
```

上傳 VHD 檔：

```bash
aws s3 cp codexaws.vhd s3://你的bucket名稱 --region eu-central-1
```

## 設定 IAM 角色

建立 `trust-policy.json`：

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

建立角色：

```bash
aws iam create-role --role-name vmimport --assume-role-policy-document file://trust-policy.json
```

建立 `role-policy.json`，把 `你的BUCKET名稱` 換成實際名稱：

```json
{
   "Version": "2012-10-17",
   "Statement": [
      {
         "Effect": "Allow",
         "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
         "Resource": ["arn:aws:s3:::你的BUCKET名稱"]
      },
      {
         "Effect": "Allow",
         "Action": ["s3:GetObject"],
         "Resource": ["arn:aws:s3:::你的BUCKET名稱/*"]
      },
      {
         "Effect": "Allow",
         "Action": ["ec2:ModifySnapshotAttribute", "ec2:CopySnapshot", "ec2:RegisterImage", "ec2:Describe*"],
         "Resource": "*"
      }
   ]
}
```

掛上 policy：

```bash
aws iam put-role-policy --role-name vmimport --policy-name vmimport --policy-document file://role-policy.json
```

## 匯入映像檔

建立 `containers.json`：

```json
[{
  "Description": "Windows 10 Base Install",
  "Format": "vhd",
  "UserBucket": {
    "S3Bucket": "你的bucket名稱",
    "S3Key": "codexaws.vhd"
  }
}]
```

執行匯入：

```bash
aws ec2 import-image --description "Windows 10" --disk-containers file://containers.json --region eu-central-1
```

查看進度：

```bash
aws ec2 describe-import-image-tasks --region eu-central-1
```

## 啟動 EC2 執行個體

匯入完成後到 EC2 Console：

1. **Images → AMI** → 右鍵 → Launch
2. Instance type 選 g2（可能需要先向 AWS 申請提高限額）
3. Security Group 開放 RDP 和 TeamViewer 的 port
4. 啟動後用「Connect」下載 RDP 檔，輸入之前設的帳號密碼登入

## 安裝後設定

- 重新綁定 TeamViewer 帳號
- 安裝 NVIDIA 驅動
- 參考文件啟用 [ENA 增強網路](https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/enhanced-networking.html#supported_instances)
