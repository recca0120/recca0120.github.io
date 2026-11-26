---
title: 'Share Composer vendor Across git worktrees: Skip composer install, Save Space and Time'
description: 'Skip composer install in every git worktree: symlink third-party packages to the main checkout via a post-checkout hook to save disk space and install time.'
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

Every new git worktree means another `composer install`. With a decent number of packages that's hundreds of MB and anywhere from tens of seconds to minutes. Run three or four AI agents, each in its own worktree, and the cost keeps stacking up.

The obvious shortcut is `ln -s ../main/vendor vendor`. That's what I did at first. Then I changed code in the worktree, the tests stayed green, and the output was still the old one. PHP wasn't loading the worktree's code at all.

This post covers the "linked vendor" setup I ended up with: third-party packages are symlinked to the main checkout, while the project's own classes, path repository packages and autoload files all load from the worktree. A git `post-checkout` hook builds it automatically, and Composer scripts block the commands that would modify the main checkout.

> Scope: PHP/Composer projects that use `git worktree` heavily. Tested on macOS with Composer 2.11, git 2.50, lefthook 2.2, PHP 7.4 and 8.5. Not tested on Windows or Linux.

If worktrees are new to you, start with [git worktree: multiple working directories from one repo]({{< ref "/post/git-worktree-parallel-work" >}}).

## Why you can't just symlink the whole vendor

The problem is in Composer's generated `vendor/composer/autoload_static.php`. It derives the project root from `__DIR__`:

```php
// vendor/composer/autoload_static.php (excerpt)
'App\\' => array(
    0 => __DIR__ . '/../..' . '/src',
),
```

PHP's `__DIR__` and `__FILE__` are **real paths with symlinks resolved**. When the whole `vendor` is a symlink, `__DIR__` points to the main checkout's `vendor/composer`, and `/../..` resolves to the main checkout as the project root.

So project classes like `App\` and path repository packages all load from the main checkout. Your changes in the worktree have no effect, yet the tests run fine.

I verified this with a minimal project: I changed the output string in `src/Hello.php` inside the worktree. With the whole vendor symlinked, `ReflectionClass::getFileName()` returned the main checkout's path and the output was the old string. With the approach below, it returned the worktree path and printed the new string.

> The nasty part is that nothing errors. Tests are green, so you assume the change works and commit it.

## Linked vendor: what gets symlinked, what gets copied

The fix is a **real** `vendor` directory in the worktree, with its contents handled separately:

| Item | Handling | Why |
|---|---|---|
| Regular packages `vendor/<ns>/<pkg>` | Absolute symlink to the main checkout | Third-party code is identical on both sides, saves space and time |
| `vendor/composer/*`, `vendor/autoload.php`, `vendor/bin` | Copied as real files | Keeps `__DIR__` inside the worktree so the root resolves to the worktree |
| Relative path repository links (e.g. `../../packages/x/y`) | Recreated with the same relative path | Points at the worktree's own packages |
| Packages that declare `bin` in `composer.json` | Copied entirely | See next section |

After building it, run `composer dump-autoload` in the worktree so the classmap is regenerated from the worktree's code. Finally, write a marker file `vendor/.linked-vendor` containing the main checkout's vendor path; the guard uses it later.

### Why packages with binaries are copied whole

This was the second trap. On PHP 7.4, the `vendor/bin/*` proxies open the package's executable by its real path. Many executables, such as database migration tools, parallel test runners and code analysis tools, walk up from their own `__DIR__` to find `autoload.php`.

If the package directory is a symlink, that walk lands on the main checkout's `vendor/autoload.php`, and you're back to the original problem. Parallel test worker scripts may also locate themselves via `__DIR__`.

So the script reads the main checkout's `vendor/composer/installed.json`, picks out packages with `bin`, and copies them in full. After that change, these executables all load the worktree's autoload.

## Automation: git hook to build, Composer scripts to guard

The setup has two halves:

- **git `post-checkout` hook**: fires on `git worktree add` or a branch switch inside a worktree. It only builds when all four hold: this is a linked worktree, `vendor` doesn't exist, `composer.lock` is byte-identical to the main checkout's, and the main checkout has a vendor. Otherwise it skips or prints what to do, and it never makes the checkout fail.
- **Composer `pre-install-cmd` / `pre-update-cmd`**: aborts when the marker file is present, so install, update, require or remove on a linked vendor can't modify the main checkout's packages.

### Detecting a linked worktree

The core check compares `git rev-parse --git-dir` with `--git-common-dir`. In the main checkout they're equal. In a linked worktree, `--git-dir` is `.git/worktrees/<name>` while `--git-common-dir` is the main repo's `.git`:

```php
function linkedVendorMainProjectDir(string $projectDir): ?string
{
    $gitDir = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --git-dir'));
    $commonDir = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --git-common-dir'));
    // Equal means main checkout or a regular clone
    if ($gitDir === $commonDir || basename($commonDir) !== '.git') {
        return null;
    }

    // The project may live in a subdirectory (e.g. backend/), so re-append the relative part
    $topLevel = linkedVendorRealPath($projectDir, linkedVendorGit($projectDir, 'rev-parse --show-toplevel'));
    $relative = substr(linkedVendorRealPath($projectDir, '.'), strlen($topLevel));

    return dirname($commonDir).$relative;
}
```

The script also clears `GIT_DIR`, `GIT_WORK_TREE` and related environment variables at startup. git sets them when running hooks, and left in place they interfere with `git -C`.

### Build in a staging directory, rename on success

The script writes everything into `vendor.linking` first and only `rename`s it to `vendor` when it all succeeds. A failure midway leaves just a staging directory full of links and copies, and deleting it doesn't touch the main checkout. If the next hook run finds no `vendor` but a leftover `vendor.linking`, it asks you to check manually instead of overwriting it.

## Installation

Below, the directory containing `composer.json` is called the **project directory**. It can be the repo root or a subdirectory (e.g. `backend/`); I tested both layouts.

**1. Add the script**: save the full script at the end of this post as `<project dir>/tools/linked-vendor.php`. It derives the project directory from its own location, so there's nothing to configure. Plain PHP, compatible with 7.4+, and it needs `git` and `composer` on PATH.

It has three subcommands:

- `post-checkout <prev> <new> <flag>`: for the git hook. Does nothing when `flag` is `0` (file checkout only), and always exits 0.
- `link`: build manually with the same conditions; exits 1 if nothing was built.
- `guard`: for Composer scripts; prints a message and exits 1 when vendor has the marker.

**2. Add the guard to `composer.json`**:

```json
{
    "scripts": {
        "pre-install-cmd": "@php tools/linked-vendor.php guard",
        "pre-update-cmd": "@php tools/linked-vendor.php guard"
    }
}
```

Composer scripts run with the project directory as the working directory, so the path is always `tools/linked-vendor.php`. `scripts` isn't part of the `content-hash` in `composer.lock`, so adding them won't mark the lock as outdated.

**3. Add the hook**, pick one.

With [lefthook](https://github.com/evilmartians/lefthook), add this to `lefthook.yml` and run `lefthook install` once:

```yaml
post-checkout:
  commands:
    linked-vendor:
      run: |
        if command -v php > /dev/null; then
          php tools/linked-vendor.php post-checkout {1} {2} {3} || true
        fi
```

> Heads-up: after adding `post-checkout` to `lefthook.yml`, `.git/hooks/post-checkout` only appears once you run `lefthook install`, or when the next lefthook hook run syncs the config automatically. Until then `git worktree add` won't build the link. Worktrees share the main repo's hooks directory, so one install is enough.

Without lefthook, use a native git hook. Save it as `.githooks/post-checkout`, make it executable and commit it:

```sh
#!/bin/sh
if command -v php > /dev/null; then
    php tools/linked-vendor.php post-checkout "$1" "$2" "$3" || true
fi
exit 0
```

Run `git config core.hooksPath .githooks` once per clone. Note that `core.hooksPath` overrides `.git/hooks`; if you already use another hook manager, merge this into your existing `post-checkout` instead.

If the project directory is a subdirectory, change the hook path to `<subdir>/tools/linked-vendor.php`.

**4. Run a normal `composer install` in the main checkout.** The guard doesn't block there because there's no marker file.

**5. Create a worktree**:

```bash
git worktree add ../feature-x -b feature-x
# You'll see something like this (numbers depend on the project;
# the script's messages are in Chinese):
# [linked-vendor] vendor 已連結主 checkout：套件 symlink N 個、有執行檔的套件複製 N 個、path repository 相對連結 N 個。
# Generated autoload files
```

## Tested behavior by scenario

| Scenario | Result |
|---|---|
| Linked worktree, no vendor, same lock, main checkout has vendor | Builds linked vendor and runs `composer dump-autoload` |
| Branch switch in main checkout or a regular clone | Does nothing, prints nothing |
| Worktree already has vendor | Does nothing |
| Lock differs from main checkout | Doesn't build; suggests `composer install` |
| Main checkout has no vendor | Doesn't build; suggests `composer install` |
| Already linked, switch to a branch with a different lock | Prints a warning and the command for a normal install |
| PHP in the hook dies with a fatal error | `git worktree add` still exits 0, worktree is created normally |
| `git worktree remove --force` on a linked worktree | Only removes links inside the worktree; md5 of every file in the main vendor unchanged |
| `rm -rf vendor && composer install` in a linked worktree | Back to a normal install; md5 of every file in the main vendor unchanged |

## Pitfalls: which commands are dangerous

Running package-writing composer commands on a linked vendor is the riskiest thing you can do. I diffed md5 checksums of every file in the main checkout's vendor before and after each command, and nothing changed:

| Command | Result |
|---|---|
| `composer install` | Aborted by `pre-install-cmd`, no package files written |
| `composer update`, `composer update <pkg>` | Aborted by `pre-update-cmd` |
| `composer require <pkg>` | Aborted by `pre-update-cmd`; Composer restores `composer.json` and `composer.lock` automatically |
| `composer remove <pkg>` | Aborted by `pre-update-cmd`, but **`composer.json` has already been modified and is not restored**; run `git checkout composer.json` yourself |
| `composer reinstall <pkg>` | Aborted by `pre-install-cmd` |
| `composer dump-autoload` (incl. `-o`) | Not blocked, since building the link needs it; only changes the worktree's `vendor/composer` |

> Warning: `--no-scripts` bypasses the guard. Composer runs no scripts at all, so the guard never fires.

When I tested install, update, remove, reinstall and require with `--no-scripts`, Composer 2.11 removed the symlinks inside the worktree and extracted real directories, and the main checkout wasn't modified. But that's how Composer currently handles symlinked directories, not a protection this setup provides, and the worktree's vendor ends up half linked, half real. In-place updates of packages installed from git source weren't tested.

The rule is simple: to change packages, run `rm -rf vendor && composer install` first, then your original command.

Other limitations:

- **The lock must be byte-identical.** Branches that change packages should use a normal install. Switching to a branch with a different lock after linking only prints a warning; nothing is fixed automatically.
- **The main checkout's vendor changes**: if the main checkout reinstalls with different versions, linked worktrees see the new files immediately, but their own `installed.json` and classmap stay stale.
- **The main checkout moves**: package links are absolute, so after a move you need to `rm -rf vendor` in the worktree and rebuild.
- **Code that decides "is this third-party?" by path will be wrong**: linked package files show the main checkout's path in backtraces, `__FILE__` and `get_included_files()`. Code that checks whether a path starts with `<project dir>/vendor/` will misjudge in a linked worktree.
- **CI and deploys are unaffected**: fresh environments have no marker file, so `composer install` passes straight through.
- **Windows**: PHP's `symlink()` needs Developer Mode or admin rights. The script tries creating a symlink first and, if that fails, skips building vendor and suggests `composer install`. I deliberately avoided junctions because I haven't verified whether recursively deleting a junction deletes its target. This is code logic only; it hasn't been run on Windows.
- Only the default `vendor` directory name is handled; `config.vendor-dir` isn't read.

## Verifying where classes actually load from

Don't just trust green tests. Save this `where-loaded.php` anywhere and run `php where-loaded.php <project dir> <class>...` inside the worktree:

```php
<?php
// usage: php where-loaded.php <composer-project-dir> <class>...
$dir = realpath($argv[1]);
require $dir.'/vendor/autoload.php';
foreach (array_slice($argv, 2) as $class) {
    class_exists($class) || interface_exists($class);
    printf("%-28s %s\n", $class, (new ReflectionClass($class))->getFileName());
}
// List every loaded file outside the project directory
foreach (get_included_files() as $file) {
    if (strpos($file, $dir.'/') !== 0) {
        echo "outside project: $file\n";
    }
}
```

Expected: project classes and path repository packages resolve inside the worktree; third-party packages resolve to the main checkout and show up as `outside project`, which is normal. If a project class, `vendor/composer/*` or `vendor/autoload.php` shows a main-checkout path, the linking is broken.

To cover PHPUnit's process isolation or parallel test workers, point `auto_prepend_file` in an ini file at a script that writes `get_included_files()` to a file on shutdown, then set `PHP_INI_SCAN_DIR=:<dir containing the ini>` so every child process inherits it. Afterwards, check the lists for non-third-party files from the main checkout.

A few quick checks:

```bash
cat vendor/.linked-vendor   # present means linked vendor; contains the main checkout's vendor path
ls -l vendor/<ns>           # regular packages are symlinks to the main checkout, path repos are relative links
du -sh vendor               # only the copied parts remain
```

## Full script: tools/linked-vendor.php

The script's user-facing messages are in Chinese; the logic is the same as described above.

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

## References

- [git-worktree documentation](https://git-scm.com/docs/git-worktree)
- [githooks: post-checkout](https://git-scm.com/docs/githooks#_post_checkout)
- [Composer Scripts documentation](https://getcomposer.org/doc/articles/scripts.md)
- [Composer Path Repository](https://getcomposer.org/doc/05-repositories.md#path)
- [PHP magic constants (`__DIR__`, `__FILE__`)](https://www.php.net/manual/en/language.constants.magic.php)
- [lefthook GitHub repo](https://github.com/evilmartians/lefthook)
