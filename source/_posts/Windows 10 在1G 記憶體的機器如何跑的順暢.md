title: Windows 10 在 1G 記憶體的機器如何跑的順暢
urlname: windows-10-running-in-1g-ram
comments: true
tags: windows10
categories: windows
author: recca0120
abbrlink: 12418
date: 2020-07-06 10:36:37
updated: 2020-07-06 10:36:37
keywords:
description:
---

## Memory Compression

用 administrator 的身份並用 powershell 執行以下命令

停用
```bash
Disable-MMAgent -mc
```

啟用
```bash
Enable-MMAgent -mc
```

## Superfetch

用 administrator 的身份並用 powershell 執行以下命令

停用
```bash
Stop-Service -Force -Name "SysMain"; Set-Service -Name "SysMain" -StartupType Disabled
```

啟用
```bash
Stop-Service -Force -Name "SysMain"
```

## Windows Definder

用 administrator 的身份並用 powershell 執行以下命令

停用
```bash
Set-MpPreference -DisableRealtimeMonitoring $true
```

啟用
```bash
Set-MpPreference -DisableRealtimeMonitoring $false
```

## Windows Network Data

用 administrator 的身份並用 powershell 執行以下命令

停用
```bash
Set-ItemProperty -Path "HKLM:\SYSTEM\ControlSet001\Services\Ndu\" -Name Start -Value 4
```

啟用
```bash
Set-ItemProperty -Path "HKLM:\SYSTEM\ControlSet001\Services\Ndu\" -Name Start -Value 2
```

## OneDriver

用 administrator 的身份並用 powershell 執行以下命令

停用
```bash
function Disable-OneDrive
{
    $regkey1 = 'Registry::HKEY_CLASSES_ROOT\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'
    $regkey2 = 'Registry::HKEY_CLASSES_ROOT\Wow6432Node\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'
    Set-ItemProperty -Path $regkey1, $regkey2 -Name System.IsPinnedToNameSpaceTree -Value 0
}
Disable-OneDrive
```

啟用
```bash
function Enable-OneDrive
{
    $regkey1 = 'Registry::HKEY_CLASSES_ROOT\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'
    $regkey2 = 'Registry::HKEY_CLASSES_ROOT\Wow6432Node\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'    
    Set-ItemProperty -Path $regkey1, $regkey2 -Name System.IsPinnedToNameSpaceTree -Value 1
}
Enable-OneDrive
```