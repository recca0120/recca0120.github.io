---
title: Windows 10 在 1GB 記憶體機器上的 5 項優化設定
description: '1GB 記憶體跑 Windows 10，關閉 Memory Compression、Superfetch、Defender、Ndu 等服務，用 PowerShell 指令大幅降低記憶體佔用。'
slug: windows-10-running-in-1g-ram
date: '2020-07-06T10:36:37+08:00'
categories:
  - Windows
tags:
  - Windows
draft: false
image: featured.png
---

## 前言

在只有 1GB 記憶體的機器上跑 Windows 10（例如 AWS 的小型 EC2），開機後記憶體就佔滿了。以下是幾個可以關掉的服務，全部用 PowerShell 以管理員身份執行。

## Memory Compression

Windows 10 會壓縮記憶體來省空間，但壓縮本身也吃 CPU 和記憶體。在小機器上關掉反而比較順。

```powershell
# 停用
Disable-MMAgent -mc

# 啟用
Enable-MMAgent -mc
```

## Superfetch (SysMain)

Superfetch 會預載常用程式到記憶體裡。記憶體不夠的機器上這個功能只會幫倒忙。

```powershell
# 停用
Stop-Service -Force -Name "SysMain"; Set-Service -Name "SysMain" -StartupType Disabled

# 啟用
Stop-Service -Force -Name "SysMain"
```

## Windows Defender

即時防護在背景持續掃描，記憶體和 CPU 都吃不少。如果是封閉環境可以考慮關掉。

```powershell
# 停用
Set-MpPreference -DisableIntrusionPreventionSystem $true -DisableIOAVProtection $true -DisableRealtimeMonitoring $true -DisableScriptScanning $true -EnableControlledFolderAccess Disabled -EnableNetworkProtection AuditMode -Force -MAPSReporting Disabled -SubmitSamplesConsent NeverSend
```

## Windows Network Data Usage Monitor

追蹤網路流量用的服務，關掉可以省一點記憶體。

```powershell
# 停用
Set-ItemProperty -Path "HKLM:\SYSTEM\ControlSet001\Services\Ndu\" -Name Start -Value 4

# 啟用
Set-ItemProperty -Path "HKLM:\SYSTEM\ControlSet001\Services\Ndu\" -Name Start -Value 2
```

## OneDrive

不需要雲端同步的話，把 OneDrive 從檔案總管隱藏掉：

```powershell
# 停用
$regkey1 = 'Registry::HKEY_CLASSES_ROOT\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'
$regkey2 = 'Registry::HKEY_CLASSES_ROOT\Wow6432Node\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'
Set-ItemProperty -Path $regkey1, $regkey2 -Name System.IsPinnedToNameSpaceTree -Value 0

# 啟用
Set-ItemProperty -Path $regkey1, $regkey2 -Name System.IsPinnedToNameSpaceTree -Value 1
```

全部調整完後重開機，記憶體使用量會降不少。
