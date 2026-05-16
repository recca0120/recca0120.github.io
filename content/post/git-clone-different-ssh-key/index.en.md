---
title: 'Three Ways to Git Clone with a Different SSH Key'
description: 'When you have multiple GitHub accounts or need a specific SSH key for a repo, here are three approaches: GIT_SSH_COMMAND for one-off use, git config core.sshCommand for a single repo, and ~/.ssh/config Host aliases with url.insteadOf for multi-account management.'
slug: git-clone-different-ssh-key
date: '2026-05-16T10:00:00+08:00'
image: featured.png
categories:
- DevTools
tags:
- git
- ssh
- github
draft: false
---

You have access to a GitHub repo, but the SSH key isn't the default `~/.ssh/id_rsa` or `~/.ssh/id_ed25519`. Running `git clone` directly gives you `Repository not found`. This post covers three ways to specify which SSH key to use, including the common pitfall with `~/.ssh/config` Host aliases.

## The Problem

I needed to clone a private repo:

```bash
git clone git@github.com:client-org/project.git
```

The SSH key required for this repo is `~/.ssh/client_key`, not the system default. Cloning without specifying it returns:

```
ERROR: Repository not found.
fatal: Could not read from remote repository.
```

The error message is misleading — the repo exists. GitHub returned "not found" because the SSH key it received doesn't have access. GitHub intentionally hides whether a repo exists at all when the key has no permission.

I tried setting a Host alias in `~/.ssh/config` first, but clone still failed with the same error. The two methods below are what actually worked.

## Method 1: GIT_SSH_COMMAND (One-Off)

The fastest approach — prefix the command with an environment variable:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/client_key' git clone git@github.com:client-org/project.git
```

`GIT_SSH_COMMAND` tells Git to use the SSH command you specify. `-i ~/.ssh/client_key` points to the private key. This only applies to that one command — subsequent push/pull won't use it automatically.

## Method 2: git config core.sshCommand (Single Repo)

After cloning, set it in the repo:

```bash
cd project
git config core.sshCommand 'ssh -i ~/.ssh/client_key'
```

This writes to `.git/config` and applies to all future git operations (pull, push, fetch) inside that repo.

Do both in one shot:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/client_key' git clone git@github.com:client-org/project.git
cd project
git config core.sshCommand 'ssh -i ~/.ssh/client_key'
```

This is the simplest approach for a single repo.

## Method 3: ~/.ssh/config Host Alias (With a Catch)

The textbook approach is to set a Host alias in `~/.ssh/config`:

```
Host github-client
    HostName github.com
    User git
    IdentityFile ~/.ssh/client_key
    IdentitiesOnly yes
```

Then clone with the alias:

```bash
git clone git@github-client:client-org/project.git
```

### The Catch: Existing Host github.com Overrides the Alias

If your `~/.ssh/config` already has a `Host github.com` block (e.g., for your personal account), SSH may ignore the alias and use the wrong key — clone fails with the same error.

Verify the alias is working before cloning:

```bash
ssh -T git@github-client
```

A successful response is `Hi <username>!` with the correct account. If the wrong account shows up, the alias isn't routing correctly.

### Add url.insteadOf to Route an Entire Org

If you have multiple repos under the same org that all need the same key, use a URL rewrite rule:

```bash
git config --global url."git@github-client:client-org/".insteadOf "git@github.com:client-org/"
```

After this, any git operation targeting `client-org` repos automatically rewrites the URL to use the `github-client` alias — no need to set `core.sshCommand` on each repo individually.

> For a single repo, `core.sshCommand` from Method 2 is more direct and doesn't touch global config.

## Comparison

| Method | Best For | Scope |
|--------|----------|-------|
| `GIT_SSH_COMMAND` | One-time clone | Single command |
| `git config core.sshCommand` | Single repo, ongoing use | Single repo |
| `~/.ssh/config` + `url.insteadOf` | Entire org, multiple repos | Global |

## References

- [GitHub Docs — Managing multiple accounts](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-personal-account/managing-multiple-accounts)
- [GitHub Docs — About SSH](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/about-ssh)
- [Git Documentation — GIT_SSH_COMMAND](https://git-scm.com/docs/git#Documentation/git.txt-codeGITSSHCOMMANDcode)
