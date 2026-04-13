---
title: 'chezmoi: One Dotfiles Repo Across macOS, Linux, and Windows'
description: 'chezmoi is a Go-based dotfiles manager. Go templates handle machine differences, age encrypts secrets, and run_onchange scripts auto-install packages. How I sync dotfiles across three operating systems.'
slug: chezmoi-dotfiles-management
date: '2026-04-13T15:30:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- chezmoi
- dotfiles
- age
- Go
draft: false
---

My work machine is a MacBook, my home desktop runs Linux, and the company handed me a Windows NUC. All three need synced `.gitconfig`, `.zshrc`, `.tmux.conf` — but each OS has quirks. Windows needs `sslCAInfo` pointing at scoop's git cert bundle; macOS uses Homebrew; Linux uses apt.

I used to hack it with symlinks and shell scripts. Now I use [chezmoi](https://github.com/twpayne/chezmoi). One dotfiles repo, three machines, one-line setup.

## Why Not stow, yadm, or dotbot

Plenty of dotfiles managers exist. chezmoi wins on three fronts:

1. **Go templates**: the same file renders differently per OS, no need to maintain three `.gitconfig` variants
2. **Native encryption**: age and gpg are first-class, so secrets can live in a public repo
3. **onchange scripts**: the Homebrew bootstrap only re-runs when the package list actually changes

stow is pure symlinks, no templating. yadm wraps git, templating via plugins. dotbot needs a YAML manifest. chezmoi bundles it all into one binary.

## Install and Init

```bash
# macOS
brew install chezmoi

# Linux
sh -c "$(curl -fsLS get.chezmoi.io)"

# Windows
winget install twpayne.chezmoi
```

Bootstrap a new machine from an existing repo:

```bash
chezmoi init --apply https://github.com/YOUR_USERNAME/dotfiles.git
```

That single line clones the repo, runs the template engine, and writes everything to `$HOME`.

## Filename Attribute System

chezmoi uses **filename prefixes** to encode behavior. The repo layout itself is the manifest — no separate config needed.

| Prefix | Effect | Example |
|--------|--------|---------|
| `dot_` | Target is a hidden file | `dot_zshrc` → `~/.zshrc` |
| `private_` | User-only permissions (0600) | `private_dot_ssh` → `~/.ssh` |
| `executable_` | Sets executable bit | `executable_bin_foo` |
| `encrypted_` | age/gpg encrypted | `encrypted_dot_env` |
| `symlink_` | Creates a symlink | `symlink_dot_bashrc` |
| `readonly_` | Strips write permissions | `readonly_dot_config.toml` |
| `.tmpl` suffix | Run through template engine | `dot_gitconfig.tmpl` |

Prefixes stack. My repo has combinations like:

```
private_executable_dot_php-cs-fixer.dist.php  → ~/.php-cs-fixer.dist.php (0700)
private_dot_ssh/                              → ~/.ssh (whole dir at 0700)
```

## Templates for Machine Differences

This is chezmoi's killer feature. My `dot_gitconfig.tmpl`:

```gotmpl
[user]
    name = {{ .name | quote }}
    email = {{ .email | quote }}

[http]
    sslBackend = openssl
{{ if eq .chezmoi.os "windows" -}}
    sslCAInfo = {{- .chezmoi.homeDir | replace "\\" "/" -}}/scoop/apps/git/current/mingw64/ssl/certs/ca-bundle.crt
{{ end }}

[core]
    autocrlf = false
    symlinks = true
```

`.name` and `.email` come from `~/.config/chezmoi/chezmoi.toml`, so each machine can have its own values. The `{{ if eq .chezmoi.os "windows" }}` block only expands on Windows. On apply, chezmoi strips the `.tmpl` and writes a clean `.gitconfig`.

Built-in variables I reach for constantly:

```gotmpl
{{ .chezmoi.os }}              # "darwin" / "linux" / "windows"
{{ .chezmoi.arch }}            # "amd64" / "arm64"
{{ .chezmoi.hostname }}        # machine name
{{ .chezmoi.username }}        # login user
{{ .chezmoi.homeDir }}         # home directory
```

Preview a template without applying:

```bash
chezmoi execute-template < dot_gitconfig.tmpl
```

## Age Encryption for Secrets

My repo is public, but it contains an SSH key and database password backups. Those are encrypted with [age](https://github.com/FiloSottile/age) before they ever hit a commit.

Generate an age key:

```bash
age-keygen -o ~/key.txt
# Public key: age1examplepublickeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Configure `~/.config/chezmoi/chezmoi.toml`:

```toml
encryption = "age"

[age]
    identity = "~/key.txt"
    recipient = "age1examplepublickeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Add files with `--encrypt`:

```bash
chezmoi add --encrypt ~/.ssh/id_ed25519
```

The repo only ever stores `private_dot_ssh/encrypted_private_id_ed25519.age` — opaque ciphertext. On apply, chezmoi decrypts using `~/key.txt` and writes the plaintext to the target.

**The one catastrophic footgun**: `key.txt` itself **must never land in the repo**. My workflow: GPG-encrypt it and stash it in a password manager. New machines must restore `key.txt` manually before running `chezmoi init --apply`.

## run_onchange: Reinstall Only When Lists Change

My `.chezmoiscripts/darwin/run_onchange_00_install-packages.sh.tmpl`:

```bash
{{ if eq .chezmoi.os "darwin" -}}
#!/bin/bash

brew install mas
brew install asdf

asdf plugin add nodejs
asdf install nodejs latest
asdf set nodejs latest

# ... many more asdf installs
{{ end -}}
```

The `run_onchange_` prefix is the key: chezmoi only runs this script when its **content hash changes**. Unchanged package list means no re-run — no more five-minute `brew install` cycles through already-installed tools on every `chezmoi apply`.

Script naming variants:

| Prefix | When It Runs |
|--------|--------------|
| `run_once_` | Once per machine, ever, for given content |
| `run_onchange_` | Whenever the contents change |
| `run_onchange_before_` | **Before** file application (install package manager first) |
| `run_onchange_after_` | **After** file application (enable fish plugins last) |

The numeric prefix (`00_`, `01_`, `02_`) controls execution order.

## .chezmoiroot: Source Lives in a Subdirectory

All my files live under `home/`:

```
dotfiles/
├── .chezmoiroot        # contains just "home"
├── Readme.md
├── install.sh
├── install.ps1
└── home/
    ├── dot_zshrc.tmpl
    ├── dot_gitconfig.tmpl
    └── .chezmoiscripts/
```

`.chezmoiroot` tells chezmoi "source files are under `home/`". Now the repo root can host a README, install scripts, and other project artifacts without chezmoi trying to apply them as dotfiles.

Great for treating your dotfiles repo like a normal project.

## .chezmoiignore: Skip Certain Files

Same syntax as `.gitignore`, but it supports templates:

```
README.md
LICENSE
{{ if ne .chezmoi.os "darwin" }}
.aerospace.toml
Library/
{{ end }}
```

Non-macOS machines skip the aerospace window manager config and the Library folder.

## Command Cheat Sheet

```bash
chezmoi add ~/.vimrc              # track an existing file
chezmoi add --encrypt ~/.env      # track encrypted
chezmoi edit ~/.zshrc             # edit the source file directly
chezmoi diff                      # show pending changes
chezmoi apply                     # write to $HOME
chezmoi apply --dry-run -v        # preview without writing
chezmoi cd                        # jump to source directory
chezmoi update                    # git pull + apply
chezmoi doctor                    # check environment health
```

`chezmoi doctor` reports the status of encryption tools, template engine, git, and friends. First thing to run when a new machine misbehaves.

## Combined with [zoxide](/en/2026/04/13/zoxide-smarter-cd/), fish, and More

My fish config, zoxide init, tmux plugins — all managed by chezmoi. New machine ritual:

1. Restore the age key
2. `sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply recca0120`
3. run_onchange scripts install CLI tools via brew / apt / scoop
4. All configs land in place
5. Open fish — zoxide, starship, fzf are already wired up

About 20 minutes end to end, most of it waiting on `brew install` downloads.

## Downsides and Gotchas

chezmoi isn't free of friction:

- **Template learning curve**: Go template syntax isn't beginner-friendly. Whitespace handling with `{{- }}` vs. `{{ }}` takes practice
- **Painful debugging**: template expansion errors are terse — I lean on `chezmoi execute-template` to isolate problems
- **Age key stewardship**: lose the key, lose every encrypted file forever. Back it up separately (I GPG-encrypt and park it in a password manager)
- **First apply is destructive**: if `$HOME` already has hand-edited dotfiles, apply overwrites them. Always `chezmoi diff` first

## References

- [chezmoi GitHub Repository](https://github.com/twpayne/chezmoi)
- [chezmoi Official Documentation](https://www.chezmoi.io/)
- [chezmoi Quick Start](https://www.chezmoi.io/quick-start/)
- [age — Simple File Encryption](https://github.com/FiloSottile/age)
- [Managing Dotfiles With Chezmoi — Nathaniel Landau](https://natelandau.com/managing-dotfiles-with-chezmoi/)

