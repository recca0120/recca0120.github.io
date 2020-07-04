title: 在 AWS EC2 上安裝 Windows 10
urlname: running-windows10-on-aws-ec2
comments: true
tags:
  - aws - virtualbox - windows10
categories:
  - aws
author: recca0120
abbrlink: 53912
date: 2020-07-04 11:34:00
updated: 2020-07-04 11:34:00
keywords:
description:
---
# Running Windows 10 on AWS EC2
# Downloading the image

Download the windows image you want.

AWS vmimport supported versions:
Microsoft Windows 10 (Professional, Enterprise, Education) (US English) (64-bit only)

So Home wont work.

You can download the trial Enterprise trial here: https://www.microsoft.com/en-us/evalcenter/evaluate-windows-10-enterprise

# Creating the virtual machine

* Use virtualbox to create a new virtual machine, make sure that it uses the VHD or VMDK or OVA format (The OS is 20 gigabyte).
* Install the Windows 10 image onto it.
* Make sure to set a username password on the administrator account otherwise cannot connect trough remote desktop.
* Install teamviewer on the virtual machine grant easy access to yourself and check extras->options
   * General -> Network Settings: Accept Incoming Lan Connections
   * Security -> Windows logon: Allowed for all users
* Start -> Allow remote access to your computer
   * Allow remote connections to this computer
* Install ec2 configure service http://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/UsingConfig_Install.html
* Restart the virtual machine.
* Wait for windows 10 updates to install.
* Exit the virtual machine.

# Install and configure awscli
```bash
sudo apt install awscli
aws configure
````

http://docs.aws.amazon.com/general/latest/gr/aws-access-keys-best-practices.html
During configure you can add your:

AWS access key.
AWS secret access key.
Default region.

If you set a default region you dont have to specify the region parameter in the following commands.
Note that P2 instances are only avalible in the US.

# Create an S3 bucket

The bucketname must be unique.

````bash
aws s3 mb s3://peterforgacs --region eu-central-1
````

# Upload image to s3
Move to the folder you store the virtual machine file and upload the virtual image to the s3 bucket.

````bash
cd myvmfolder
aws s3 cp codexaws.vhd s3://peterforgacs --region eu-central-1
````

# Configuration files

Create a trust policy in the file trust-policy.json

```json
{
   "Version": "2012-10-17",
   "Statement": [
      {
         "Effect": "Allow",
         "Principal": { "Service": "vmie.amazonaws.com" },
         "Action": "sts:AssumeRole",
         "Condition": {
            "StringEquals":{
               "sts:Externalid": "vmimport"
            }
         }
      }
   ]
}
````

Create a vmimport role and add vim import/export access to it.

````bash
aws iam create-role --role-name vmimport --assume-role-policy-document file://trust-policy.json
````

Create a file named role-policy.json replace the !!REPLACEME!! to the bucketname you are using.

````json
{
   "Version": "2012-10-17",
   "Statement": [
      {
         "Effect": "Allow",
         "Action": [
            "s3:ListBucket",
            "s3:GetBucketLocation"
         ],
         "Resource": [
            "arn:aws:s3:::!!REPLACEME!!"
         ]
      },
      {
         "Effect": "Allow",
         "Action": [
            "s3:GetObject"
         ],
         "Resource": [
            "arn:aws:s3:::!!REPLACEME!!/*"
         ]
      },
      {
         "Effect": "Allow",
         "Action":[
            "ec2:ModifySnapshotAttribute",
            "ec2:CopySnapshot",
            "ec2:RegisterImage",
            "ec2:Describe*"
         ],
         "Resource": "*"
      }
   ]
}
````

Add the policy to the vmimport role.

````bash
aws iam put-role-policy --role-name vmimport --policy-name vmimport --policy-document file://role-policy.json
````

Create a configuration file on your computer called containers.json.
Replace bucketname and myimage.vhd with your bucket and image name.

````json
[{ "Description": "Windows 10 Base Install", "Format": "vhd", "UserBucket": { "S3Bucket": "peterforgacs", "S3Key": "codexaws.vhd" } }]
````

# Create EC2 AMI from S3 VHD image

````bash
aws ec2 import-image --description "Windows 10" --disk-containers file://containers.json --region eu-central-1
````

This may take a while you can check on the status of the import.


````bash
aws ec2 describe-import-image-tasks --region eu-central-1
````

When the import status is completed you can head to the EC2 console and select the correct region.

# Create EC2 instance from AMI

Images -> AMI -> Right click -> Launch

* Instance type: g2 (You might have to ask the support for an increase in the g2 limit).
* Security Group: Allow RDP, Teamviewer ports.

Instances -> Launch

# Running the instance

Instances -> Right click -> Connect

You download the remote desktop file.

Launch that file with the username and password you set on the original instance.

In the form:
.\Username
pass

# Post Install

Reassign teamviewer to the your teamviewer.
Download nvidia experience and install a driver.


# Enabling enhanced networking with the Elastic Network Adapter (ENA) on Windows instances
- [Installing the latest version of EC2Launch](https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/ec2launch-download.html)
- [Enhanced networking on Windows](https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/enhanced-networking.html#supported_instances)