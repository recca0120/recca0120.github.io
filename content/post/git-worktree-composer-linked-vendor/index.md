---
title: 'git worktree 共用 Composer vendor：直接 symlink 會讓測試假綠，正確做法在這'
description: 'git worktree 直接 symlink 整個 vendor 會讓 PHP 從主 checkout 載入專案類別，改了程式測試照綠。用連結版 vendor 搭配 post-checkout hook 與 Composer 防呆，免跑 composer install。'
slug: git-worktree-composer-linked-vendor
date: '2026-11-26T22:10:00+08:00'
image: featured.jpg
categories:
- PHP
tags:
- PHP
- Composer
- git
- worktree
draft: false
---

每開一個 git worktree 就要重跑一次 `composer install`，套件一多就是幾百 MB、幾十秒到幾分鐘。同時開三四個 AI agent 各佔一個 worktree 時，這個成本會一直疊上去。

最直覺的省法是 `ln -s ../main/vendor vendor`。我一開始也這樣做，結果在 worktree 改了程式，測試照樣綠，輸出卻還是舊的。PHP 載入的根本不是 worktree 裡那份程式碼。

這篇整理我後來用的「連結版 vendor」：第三方套件 symlink 到主 checkout，專案自己的類別、path repository 套件、autoload 都從 worktree 載入。搭配 git `post-checkout` hook 自動建立，再用 Composer scripts 擋住會改到主 checkout 的指令。

> 適用範圍：PHP／Composer 專案，大量使用 `git worktree`。實測環境是 macOS、Composer 2.11、git 2.50、lefthook 2.2、PHP 7.4 與 8.5；Windows 和 Linux 沒有實測。

如果你還不熟 worktree，可以先看 [git worktree：一個 repo 同時開多份工作目錄]({{< ref "/post/git-worktree-parallel-work" >}})。

## 為什麼不能把整個 vendor symlink 過去

問題出在 Composer 產生的 `vendor/composer/autoload_static.php`。它用 `__DIR__` 往上推算專案根目錄：

```php
// vendor/composer/autoload_static.php（節錄）
'App\\' => array(
    0 => __DIR__ . '/../..' . '/src',
),
```

而 PHP 的 `__DIR__`、`__FILE__` 是**解析 symlink 之後的實體路徑**。整個 `vendor` 是 symlink 時，`__DIR__` 指到主 checkout 的 `vendor/composer`，`/../..` 算出來的專案根目錄就變成主 checkout。

結果是 `App\` 這類專案類別、path repository 的套件，全部從主 checkout 載入。worktree 裡的修改完全沒生效，測試卻跑得好好的。

我用一個最小專案驗證過：在 worktree 改了 `src/Hello.php` 的輸出字串。整個 vendor symlink 時，`ReflectionClass::getFileName()` 回傳主 checkout 的路徑，輸出還是舊字串；換成下面的做法後，回傳 worktree 路徑，輸出是新字串。

> 這種錯最麻煩的地方是不會報錯。測試是綠的，你會以為改動沒問題就 commit 了。

## 連結版 vendor：哪些 symlink、哪些複製

解法是在 worktree 建一個**實體的** `vendor` 目錄，裡面的東西分開處理：

| 項目 | 處理方式 | 原因 |
|---|---|---|
| `vendor/<ns>/<pkg>` 一般套件 | 絕對路徑 symlink 到主 checkout | 第三方程式碼兩邊一樣，省空間和時間 |
| `vendor/composer/*`、`vendor/autoload.php`、`vendor/bin` | 複製成實體檔 | 讓 `__DIR__` 落在 worktree，根目錄才會算成 worktree |
| path repository 的相對連結（如 `../../packages/x/y`） | 照原本的相對路徑重建 | 指向 worktree 自己的 packages |
| `composer.json` 有宣告 `bin` 的套件 | 整包複製 | 見下一段 |

建完之後在 worktree 跑一次 `composer dump-autoload`，classmap 會依 worktree 的程式碼重新產生。最後寫一個標記檔 `vendor/.linked-vendor`，內容是主 checkout 的 vendor 路徑，給後面的防呆辨識用。

### 有執行檔的套件為什麼要整包複製

這是我踩到的第二個坑。在 PHP 7.4 下，`vendor/bin/*` 的 proxy 會用實體路徑開啟套件裡的執行檔。很多套件的執行檔，像資料庫 migration 工具、平行測試執行器、程式碼分析工具，會用自己的 `__DIR__` 往上找 `autoload.php`。

套件目錄如果是 symlink，往上找到的就是主 checkout 的 `vendor/autoload.php`，又回到前面的問題。平行測試的 worker 腳本也可能用 `__DIR__` 定位自己。

所以腳本會讀主 checkout 的 `vendor/composer/installed.json`，把有 `bin` 的套件挑出來整包複製。改成這樣之後，這些執行檔載入的 autoload 都是 worktree 的。

## 自動化：git hook 建立、Composer scripts 防呆

整套東西分成兩半：

- **git `post-checkout` hook**：`git worktree add` 或在 worktree 內切 branch 時觸發。四個條件都成立才建：這是 linked worktree、`vendor` 不存在、`composer.lock` 跟主 checkout 逐位元組相同、主 checkout 有 vendor。條件不符就略過或印出該怎麼做，而且一律不讓 checkout 失敗。
- **Composer `pre-install-cmd`／`pre-update-cmd`**：偵測到標記檔就中止，避免在連結版 vendor 上 install、update、require、remove，改到主 checkout 的套件。

### 判斷是不是 linked worktree

核心邏輯是比較 `git rev-parse --git-dir` 和 `--git-common-dir`。在主 checkout 兩者相同；在 linked worktree，`--git-dir` 是 `.git/worktrees/<name>`，`--git-common-dir` 才是主 repo 的 `.git`：

```php
function linkedVendorMainProjectDir(string $projectDir): ?string
{
    $gitDir = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --git-dir'));
    $commonDir = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --git-common-dir'));
    // 兩者相同代表是主 checkout 或一般 clone
    if ($gitDir === $commonDir || basename($commonDir) !== '.git') {
        return null;
    }

    // 專案目錄可能在 repo 的子目錄（例如 backend/），要把相對位置補回去
    $topLevel = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --show-toplevel'));
    $relative = substr(linkedVendorRealPath($projectDir, '.'), strlen($topLevel));

    return dirname($commonDir).$relative;
}
```

腳本開頭會清掉 `GIT_DIR`、`GIT_WORK_TREE` 這幾個環境變數。hook 執行時 git 會設定它們，不清掉的話 `git -C` 會被干擾。

### 先建在暫存目錄，成功才改名

建立過程是先寫到 `vendor.linking`，全部成功才 `rename` 成 `vendor`。中途失敗只會留下一個暫存目錄，裡面只有連結和複製檔，刪掉不影響主 checkout。下次 hook 看到 `vendor` 不存在、`vendor.linking` 還在，會提示你手動確認，不會蓋過去。

## 安裝步驟

以下把 `composer.json` 所在目錄稱為**專案目錄**，它可以是 repo 根目錄，也可以是子目錄（例如 `backend/`），兩種配置我都測過。

**1. 放腳本**：把文末的完整腳本存成 `<專案目錄>/tools/linked-vendor.php`。它用自己的位置推算專案目錄，不需要額外設定。純 PHP，相容 7.4 以上，需要 PATH 上有 `git` 和 `composer`。

子指令有三個：

- `post-checkout <prev> <new> <flag>`：給 git hook 用。`flag` 是 `0`（只 checkout 檔案）時不動作，結束碼一律 0。
- `link`：手動建立，判斷條件一樣，沒建成時結束碼 1。
- `guard`：給 Composer scripts 用，vendor 有標記就印訊息並以 1 結束。

**2. 在 `composer.json` 加防呆**：

```json
{
    "scripts": {
        "pre-install-cmd": "@php tools/linked-vendor.php guard",
        "pre-update-cmd": "@php tools/linked-vendor.php guard"
    }
}
```

Composer scripts 的工作目錄就是專案目錄，所以路徑固定是 `tools/linked-vendor.php`。`scripts` 不在 `composer.lock` 的 `content-hash` 計算範圍內，加上去不會讓 lock 過期。

**3. 加 hook**，二選一。

用 [lefthook](https://github.com/evilmartians/lefthook) 的話，加到 `lefthook.yml` 後執行一次 `lefthook install`：

```yaml
post-checkout:
  commands:
    linked-vendor:
      run: |
        if command -v php > /dev/null; then
          php tools/linked-vendor.php post-checkout {1} {2} {3} || true
        fi
```

> 小提醒：`lefthook.yml` 新增 `post-checkout` 後，`.git/hooks/post-checkout` 要等你跑 `lefthook install`，或下一次任何 lefthook hook 執行時自動同步才會出現。在那之前 `git worktree add` 不會建連結。worktree 共用主 repo 的 hooks 目錄，裝一次就好。

沒有 lefthook 就用原生 git hook，存成 `.githooks/post-checkout`，加執行權限並進版控：

```sh
#!/bin/sh
if command -v php > /dev/null; then
    php tools/linked-vendor.php post-checkout "$1" "$2" "$3" || true
fi
exit 0
```

每個 clone 執行一次 `git config core.hooksPath .githooks`。注意 `core.hooksPath` 會蓋掉 `.git/hooks`，已經用別的 hook 管理工具的話，把這段併進既有的 `post-checkout`。

專案目錄在子目錄時，hook 裡的路徑改成 `<子目錄>/tools/linked-vendor.php`。

**4. 主 checkout 正常 `composer install`**。防呆在主 checkout 不會擋，因為沒有標記檔。

**5. 開 worktree**：

```bash
git worktree add ../feature-x -b feature-x
# 會看到類似這樣的輸出（數字依專案而定）：
# [linked-vendor] vendor 已連結主 checkout：套件 symlink N 個、有執行檔的套件複製 N 個、path repository 相對連結 N 個。
# Generated autoload files
```

## 各情境的實測行為

| 情境 | 結果 |
|---|---|
| linked worktree、無 vendor、lock 相同、主 checkout 有 vendor | 建連結版 vendor 並 `composer dump-autoload` |
| 主 checkout 或一般 clone 切 branch | 不動作、不印訊息 |
| worktree 已有 vendor | 不動作 |
| lock 跟主 checkout 不同 | 不建，提示改用 `composer install` |
| 主 checkout 沒有 vendor | 不建，提示執行 `composer install` |
| 已是連結版，切到 lock 不同的 branch | 印警告和改成正常安裝的指令 |
| hook 裡的 PHP 直接 fatal error | `git worktree add` 結束碼仍是 0，worktree 正常建立 |
| `git worktree remove --force` 連結版 worktree | 只刪 worktree 內的連結，主 checkout 的 vendor 全檔 md5 不變 |
| 連結版 worktree 執行 `rm -rf vendor && composer install` | 回到正常安裝，主 checkout 的 vendor 全檔 md5 不變 |

## 踩雷清單：哪些指令會出事

在連結版 vendor 上跑會寫入套件的 composer 指令是最危險的事。我每個指令前後都對主 checkout 的 vendor 做全檔 md5 比對，結果都沒變：

| 指令 | 結果 |
|---|---|
| `composer install` | `pre-install-cmd` 中止，沒寫入任何套件檔 |
| `composer update`、`composer update <pkg>` | `pre-update-cmd` 中止 |
| `composer require <pkg>` | `pre-update-cmd` 中止；Composer 會自動還原 `composer.json` 和 `composer.lock` |
| `composer remove <pkg>` | `pre-update-cmd` 中止，但 **`composer.json` 已經被改掉而且不會還原**，要自己 `git checkout composer.json` |
| `composer reinstall <pkg>` | `pre-install-cmd` 中止 |
| `composer dump-autoload`（含 `-o`） | 不擋，建連結本身就要用它；只改 worktree 的 `vendor/composer` |

> 警告：`--no-scripts` 擋不住。Composer 不跑任何 scripts，防呆完全失效。

我實測加上 `--no-scripts` 跑 install、update、remove、reinstall、require 時，Composer 2.11 會先拆掉 worktree 內的 symlink 再解壓實體目錄，主 checkout 沒被改到。但這是 Composer 現在對 symlink 目錄的處理方式，不是這套做法提供的保護，而且 worktree 的 vendor 會變成一半連結、一半實體。用 git source 方式安裝的套件原地更新的情況我沒測。

結論很簡單：要改套件，先 `rm -rf vendor && composer install`，再跑原本的指令。

其他限制：

- **lock 必須逐位元組相同**。改套件的 branch 請正常安裝。建好之後才切到 lock 不同的 branch，只會印警告，不會自動處理。
- **主 checkout 的 vendor 變了**：主 checkout 重新 install 換了版本，連結版 worktree 會直接看到新檔案，但自己的 `installed.json`、classmap 還是舊的。
- **主 checkout 搬家**：套件連結是絕對路徑，搬完要在 worktree `rm -rf vendor` 後重建。
- **用路徑判斷「是不是第三方程式碼」的程式會失準**：連結的套件在 backtrace、`__FILE__`、`get_included_files()` 裡顯示的是主 checkout 的路徑。如果程式用「路徑以 `<專案目錄>/vendor/` 開頭」判斷呼叫端，在連結版 worktree 會判斷錯。
- **CI 和部署不受影響**：全新環境沒有標記檔，`composer install` 直接通過。
- **Windows**：PHP 的 `symlink()` 需要開發人員模式或系統管理員權限。腳本會先試建一個 symlink，失敗就不建 vendor，改提示 `composer install`。我刻意不用 junction，因為不確定遞迴刪除 junction 時會不會刪到目標。這段只是程式邏輯，沒在 Windows 上跑過。
- 只處理預設的 `vendor` 目錄名稱，沒有讀 `config.vendor-dir`。

## 驗證：類別到底從哪裡載入

不要只看測試綠不綠。存一支 `where-loaded.php` 放在任意位置，在 worktree 執行 `php where-loaded.php <專案目錄> <類別>...`：

```php
<?php
// usage: php where-loaded.php <composer-project-dir> <class>...
$dir = realpath($argv[1]);
require $dir.'/vendor/autoload.php';
foreach (array_slice($argv, 2) as $class) {
    class_exists($class) || interface_exists($class);
    printf("%-28s %s\n", $class, (new ReflectionClass($class))->getFileName());
}
// 列出所有不在專案目錄內的已載入檔案
foreach (get_included_files() as $file) {
    if (strpos($file, $dir.'/') !== 0) {
        echo "outside project: $file\n";
    }
}
```

預期結果：專案類別和 path repository 套件的路徑在 worktree 內；第三方套件在主 checkout，會列在 `outside project`，這是正常的。如果專案類別或 `vendor/composer/*`、`vendor/autoload.php` 出現在主 checkout 的路徑，代表連結方式有問題。

要涵蓋 PHPUnit 的隔離行程或平行測試的 worker，可以用一個 ini 把 `auto_prepend_file` 指到一支「shutdown 時把 `get_included_files()` 寫進檔案」的腳本，再用 `PHP_INI_SCAN_DIR=:<ini 所在目錄>` 讓子行程都繼承。跑完檢查清單裡有沒有主 checkout 的非第三方檔案。

幾個快速檢查：

```bash
cat vendor/.linked-vendor   # 有這個檔就是連結版，內容是主 checkout 的 vendor 路徑
ls -l vendor/<ns>           # 一般套件是指向主 checkout 的 symlink，path repository 是相對連結
du -sh vendor               # 只剩複製的部分
```

## 完整腳本：tools/linked-vendor.php

```php
<?php

declare(strict_types=1);

const LINKED_VENDOR_MARKER = '.linked-vendor';
const LINKED_VENDOR_PREFIX = '[linked-vendor] ';

function linkedVendorSay(string $message): void
{
    fwrite(STDERR, LINKED_VENDOR_PREFIX.$message.PHP_EOL);
}

function linkedVendorGit(string $dir, string $args): string
{
    $output = [];
    $code = 0;
    $null = DIRECTORY_SEPARATOR === '\\' ? 'NUL' : '/dev/null';
    exec('git -C '.escapeshellarg($dir).' '.$args.' 2>'.$null, $output, $code);
    if ($code !== 0 || ! isset($output[0])) {
        throw new RuntimeException('git '.$args.' 失敗');
    }

    return trim($output[0]);
}

function linkedVendorRealPath(string $base, string $path): string
{
    $absolute = preg_match('#^([A-Za-z]:)?[\\\\/]#', $path) === 1 ? $path : $base.'/'.$path;
    $real = realpath($absolute);
    if ($real === false) {
        throw new RuntimeException('找不到 '.$absolute);
    }

    return $real;
}

function linkedVendorMainProjectDir(string $projectDir): ?string
{
    $gitDir = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --git-dir'));
    $commonDir = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --git-common-dir'));
    if ($gitDir === $commonDir || basename($commonDir) !== '.git') {
        return null;
    }

    $topLevel = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --show-toplevel'));
    $relative = substr(linkedVendorRealPath($projectDir, '.'), strlen($topLevel));

    return dirname($commonDir).$relative;
}

function linkedVendorLocksMatch(string $projectDir, string $mainProjectDir): bool
{
    $lock = $projectDir.'/composer.lock';
    $mainLock = $mainProjectDir.'/composer.lock';

    return is_file($lock) && is_file($mainLock) && file_get_contents($lock) === file_get_contents($mainLock);
}

function linkedVendorSymlink(string $target, string $link): void
{
    if (! @symlink($target, $link)) {
        throw new RuntimeException('無法建立 symlink '.$link.' -> '.$target);
    }
}

function linkedVendorCopyFile(string $source, string $destination): void
{
    if (! copy($source, $destination)) {
        throw new RuntimeException('無法複製 '.$source);
    }
    chmod($destination, fileperms($source) & 0777);
}

function linkedVendorCopyTree(string $source, string $destination): void
{
    mkdir($destination);
    foreach (array_diff(scandir($source), ['.', '..']) as $entry) {
        $from = $source.'/'.$entry;
        $to = $destination.'/'.$entry;
        if (is_link($from)) {
            linkedVendorSymlink(readlink($from), $to);
        } elseif (is_dir($from)) {
            linkedVendorCopyTree($from, $to);
        } else {
            linkedVendorCopyFile($from, $to);
        }
    }
}

function linkedVendorSymlinkSupported(string $stagingDir, string $target): bool
{
    $probe = $stagingDir.'/.symlink-probe';
    if (! @symlink($target, $probe)) {
        return false;
    }

    return @unlink($probe) || @rmdir($probe);
}

/**
 * @return array<string, true>
 */
function linkedVendorPackagesWithBinaries(string $mainVendor): array
{
    $installed = json_decode((string) file_get_contents($mainVendor.'/composer/installed.json'), true);
    $packages = [];
    foreach ($installed['packages'] ?? $installed ?? [] as $package) {
        if (! empty($package['bin'])) {
            $packages[$package['name']] = true;
        }
    }

    return $packages;
}

/**
 * @return array{int, int, int, array<int, string>}
 */
function linkedVendorBuild(string $mainVendor, string $stagingDir): array
{
    $withBinaries = linkedVendorPackagesWithBinaries($mainVendor);
    $packages = 0;
    $copied = 0;
    $relativeLinks = 0;
    $skipped = [];
    foreach (array_diff(scandir($mainVendor), ['.', '..', LINKED_VENDOR_MARKER]) as $entry) {
        $from = $mainVendor.'/'.$entry;
        $to = $stagingDir.'/'.$entry;
        if (is_link($from)) {
            $skipped[] = $entry;
        } elseif (! is_dir($from)) {
            linkedVendorCopyFile($from, $to);
        } elseif ($entry === 'bin') {
            linkedVendorCopyTree($from, $to);
        } else {
            mkdir($to);
            foreach (array_diff(scandir($from), ['.', '..']) as $child) {
                if (is_link($from.'/'.$child)) {
                    linkedVendorSymlink(readlink($from.'/'.$child), $to.'/'.$child);
                    $relativeLinks++;
                } elseif (isset($withBinaries[$entry.'/'.$child])) {
                    linkedVendorCopyTree($from.'/'.$child, $to.'/'.$child);
                    $copied++;
                } elseif (is_dir($from.'/'.$child)) {
                    linkedVendorSymlink($from.'/'.$child, $to.'/'.$child);
                    $packages++;
                } else {
                    linkedVendorCopyFile($from.'/'.$child, $to.'/'.$child);
                }
            }
        }
    }

    return [$packages, $copied, $relativeLinks, $skipped];
}

function linkedVendorLink(string $projectDir, bool $verbose): int
{
    $mainProjectDir = linkedVendorMainProjectDir($projectDir);
    if ($mainProjectDir === null) {
        if ($verbose) {
            linkedVendorSay('略過：這裡不是 git worktree（主 checkout 或一般 clone 請直接 composer install）。');
        }

        return $verbose ? 1 : 0;
    }

    $vendor = $projectDir.'/vendor';
    if (file_exists($vendor) || is_link($vendor)) {
        if (is_file($vendor.'/'.LINKED_VENDOR_MARKER) && ! linkedVendorLocksMatch($projectDir, $mainProjectDir)) {
            linkedVendorSay('警告：vendor 連結的是主 checkout 的套件，但 composer.lock 已與主 checkout 不同（常見於切換 branch），套件版本可能不符。');
            linkedVendorSay('改成正常安裝：在 '.$projectDir.' 執行 rm -rf vendor && composer install');
        } elseif ($verbose) {
            linkedVendorSay('略過：vendor 已存在。');
        }

        return 0;
    }

    $mainVendor = $mainProjectDir.'/vendor';
    if (! is_dir($mainVendor.'/composer') || is_file($mainVendor.'/'.LINKED_VENDOR_MARKER)) {
        linkedVendorSay('未建立連結：主 checkout（'.$mainProjectDir.'）沒有可用的 vendor。請在 '.$projectDir.' 執行 composer install。');

        return $verbose ? 1 : 0;
    }

    if (! linkedVendorLocksMatch($projectDir, $mainProjectDir)) {
        linkedVendorSay('未建立連結：composer.lock 與主 checkout 不同。請在 '.$projectDir.' 執行 composer install（正常安裝）。');

        return $verbose ? 1 : 0;
    }

    $staging = $projectDir.'/vendor.linking';
    if (file_exists($staging) || is_link($staging)) {
        linkedVendorSay('未建立連結：'.$staging.' 已存在（上次中斷留下的）。確認後刪除它再執行 php '.__FILE__.' link，或直接 composer install。');

        return $verbose ? 1 : 0;
    }

    mkdir($staging);
    if (! linkedVendorSymlinkSupported($staging, $mainVendor)) {
        rmdir($staging);
        linkedVendorSay('未建立連結：這個系統不能建立 symlink（Windows 需開發人員模式或系統管理員權限）。請在 '.$projectDir.' 執行 composer install。');

        return $verbose ? 1 : 0;
    }

    try {
        [$packages, $copied, $relativeLinks, $skipped] = linkedVendorBuild($mainVendor, $staging);
        file_put_contents($staging.'/'.LINKED_VENDOR_MARKER, $mainVendor.PHP_EOL);
    } catch (Throwable $exception) {
        linkedVendorSay('建立連結中途失敗：'.$exception->getMessage());
        linkedVendorSay('已留下 '.$staging.'（只含連結與複製檔，刪除它不影響主 checkout）；刪除後請在 '.$projectDir.' 執行 composer install。');

        return $verbose ? 1 : 0;
    }

    if (! rename($staging, $vendor)) {
        linkedVendorSay('無法把 '.$staging.' 改名為 vendor；刪除它後請執行 composer install。');

        return $verbose ? 1 : 0;
    }

    linkedVendorSay(sprintf('vendor 已連結主 checkout：套件 symlink %d 個、有執行檔的套件複製 %d 個、path repository 相對連結 %d 個。', $packages, $copied, $relativeLinks));
    if ($skipped !== []) {
        linkedVendorSay('略過主 checkout vendor 頂層的 symlink：'.implode(', ', $skipped));
    }

    $code = 0;
    passthru('composer dump-autoload --working-dir='.escapeshellarg($projectDir), $code);
    if ($code !== 0) {
        linkedVendorSay('composer dump-autoload 失敗（結束碼 '.$code.'），請在 '.$projectDir.' 手動執行 composer dump-autoload。');
    }

    return 0;
}

function linkedVendorGuard(string $projectDir): int
{
    $marker = $projectDir.'/vendor/'.LINKED_VENDOR_MARKER;
    if (! is_file($marker)) {
        return 0;
    }

    linkedVendorSay('已中止：vendor 的套件目錄是 symlink 到主 checkout（'.trim((string) file_get_contents($marker)).'），在這裡 install／update／require／remove 會改到主 checkout 的套件。');
    linkedVendorSay('改成正常安裝：在 '.$projectDir.' 執行 rm -rf vendor && composer install，再重跑原本的指令。');

    return 1;
}

foreach (['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX'] as $gitVariable) {
    putenv($gitVariable);
}

$projectDir = dirname(__DIR__);
$command = $argv[1] ?? '';

if ($command === 'guard') {
    exit(linkedVendorGuard($projectDir));
}

if ($command === 'post-checkout' || $command === 'link') {
    if ($command === 'post-checkout' && ($argv[4] ?? '1') === '0') {
        exit(0);
    }
    try {
        $code = linkedVendorLink($projectDir, $command === 'link');
    } catch (Throwable $exception) {
        linkedVendorSay('略過：'.$exception->getMessage());
        $code = $command === 'link' ? 1 : 0;
    }
    exit($code);
}

fwrite(STDERR, 'usage: php '.basename(__FILE__).' post-checkout <prev> <new> <flag> | link | guard'.PHP_EOL);
exit(2);
```

## 參考資源

- [git-worktree 官方文件](https://git-scm.com/docs/git-worktree)
- [githooks：post-checkout](https://git-scm.com/docs/githooks#_post_checkout)
- [Composer Scripts 文件](https://getcomposer.org/doc/articles/scripts.md)
- [Composer Path Repository](https://getcomposer.org/doc/05-repositories.md#path)
- [PHP 魔術常數（`__DIR__`、`__FILE__`）](https://www.php.net/manual/en/language.constants.magic.php)
- [lefthook GitHub repo](https://github.com/evilmartians/lefthook)
