---
title: 'Run Windows 10 on 1GB RAM: 5 PowerShell Optimizations'
description: 'Disable Memory Compression, Superfetch, Windows Defender, and Ndu via PowerShell to significantly reduce RAM usage and run Windows 10 on just 1GB of memory.'
slug: windows-10-running-in-1g-ram
date: '2020-07-06T10:36:37+08:00'
categories:
  - Windows
tags:
  - Windows
draft: false
image: featured.png
---

Running Windows 10 on a machine with only 1GB of RAM (e.g., a small AWS EC2 instance) means memory is maxed out right after boot. The following services can be disabled to reduce usage — run all commands in PowerShell as Administrator.

## Memory Compression

Windows 10 compresses memory to save space, but the compression itself consumes CPU and memory. On small machines, disabling it actually improves performance.

```powershell
# Disable
Disable-MMAgent -mc

# Enable
Enable-MMAgent -mc
```

## Superfetch (SysMain)

Superfetch preloads frequently used programs into memory. On memory-constrained machines, this does more harm than good.

```powershell
# Disable
Stop-Service -Force -Name "SysMain"; Set-Service -Name "SysMain" -StartupType Disabled

# Enable
Stop-Service -Force -Name "SysMain"
```

## Windows Defender

Real-time protection continuously scans in the background, consuming significant memory and CPU. If you're in an isolated environment, consider disabling it.

```powershell
# Disable
Set-MpPreference -DisableIntrusionPreventionSystem $true -DisableIOAVProtection $true -DisableRealtimeMonitoring $true -DisableScriptScanning $true -EnableControlledFolderAccess Disabled -EnableNetworkProtection AuditMode -Force -MAPSReporting Disabled -SubmitSamplesConsent NeverSend
```

## Windows Network Data Usage Monitor

This service tracks network traffic. Disabling it frees up a bit of memory.

```powershell
# Disable
Set-ItemProperty -Path "HKLM:\SYSTEM\ControlSet001\Services\Ndu\" -Name Start -Value 4

# Enable
Set-ItemProperty -Path "HKLM:\SYSTEM\ControlSet001\Services\Ndu\" -Name Start -Value 2
```

## OneDrive

If you don't need cloud sync, hide OneDrive from File Explorer:

```powershell
# Disable
$regkey1 = 'Registry::HKEY_CLASSES_ROOT\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'
$regkey2 = 'Registry::HKEY_CLASSES_ROOT\Wow6432Node\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}'
Set-ItemProperty -Path $regkey1, $regkey2 -Name System.IsPinnedToNameSpaceTree -Value 0

# Enable
Set-ItemProperty -Path $regkey1, $regkey2 -Name System.IsPinnedToNameSpaceTree -Value 1
```

After making all these adjustments and rebooting, memory usage should drop significantly.
