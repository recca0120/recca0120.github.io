---
title: 'Mole: Manage SSH Tunnels with Aliases, Auto-Reconnect, and Background Mode'
date: '2026-03-09T09:00:00+08:00'
slug: mole-ssh-tunnel
description: 'Mole is a Go-based SSH tunnel manager with alias storage, auto-reconnect, background execution, and multiple tunnels over a single SSH connection — much easier than typing ssh -L every time.'
categories:
  - Tools
tags:
  - ssh
  - tunnel
  - mole
  - developer-tools
  - devops
---

Every time you need to connect to a remote MySQL or Redis, you dig through your shell history for the `ssh -L` command, tweak the ports, and run it again.
Three months later, you've forgotten the whole thing.
[Mole](https://github.com/davrodpin/mole) lets you save those settings as named aliases and connect with a single command next time.

## The Problem with ssh -L

The `ssh -L` flag works fine, but it gets painful:

```bash
# Forward local 3306 to remote 172.16.0.10:3306 through a jump server
ssh -L 3306:172.16.0.10:3306 user@jump.example.com
```

**Long commands**: You need to remember the jump server, remote IP, and two ports. One typo and it doesn't work.

**Connections drop**: SSH disconnects after idle periods. When that happens, you reconnect manually.

**Background mode is awkward**: You need `-f -N` to run in the background, and have to `kill` the process manually to stop it.

**Multiple tunnels need multiple terminals**: MySQL in one window, Redis in another — your terminal fills up fast.

Mole solves all four.

## Installation

```bash
# macOS (Homebrew)
brew tap davrodpin/homebrew-mole
brew install mole

# macOS (MacPorts)
sudo port install mole

# Linux / macOS (install script)
bash <(curl -fsSL https://raw.githubusercontent.com/davrodpin/mole/master/tools/install.sh)
```

Verify the installation:

```bash
mole version
```

## Basic Usage: Local Tunnel

A local tunnel is the most common type — it forwards a local port through a jump server to a remote service.

```bash
mole start local \
  --source 127.0.0.1:3306 \            # Local address:port to listen on
  --destination 172.16.0.10:3306 \     # Remote target address:port
  --server ec2-user@jump.example.com:22  # SSH jump server
```

This makes `127.0.0.1:3306` connect to the remote MySQL. It's equivalent to:

```bash
ssh -L 3306:172.16.0.10:3306 ec2-user@jump.example.com
```

You can also skip the port and let Mole pick an available one automatically:

```bash
# Omit the port in --source, Mole finds a free port
mole start local \
  --source 127.0.0.1 \
  --destination 172.16.0.10:3306 \
  --server ec2-user@jump.example.com
```

Mole prints which port it chose — connect to that.

## Multiple Tunnels Over One Connection

You can open several tunnels through the same jump server in a single command, without multiple SSH connections:

```bash
mole start local \
  --source :3306 \                     # MySQL
  --source :6379 \                     # Redis
  --destination 172.16.0.10:3306 \
  --destination 172.16.0.10:6379 \
  --server ec2-user@jump.example.com
```

Each `--source` maps to the corresponding `--destination` by position.

## Aliases: Save and Reuse

Typing the full command every time is tedious. Use `mole add` to save a configuration as a named alias:

```bash
mole add local prod-mysql \
  --source 127.0.0.1:3306 \
  --destination 172.16.0.10:3306 \
  --server ec2-user@jump.example.com \
  --key ~/.ssh/prod-key.pem
```

Next time, just:

```bash
mole start local prod-mysql
```

To list all saved aliases:

```bash
mole show aliases
```

To remove one:

```bash
mole delete prod-mysql
```

## Background Mode

Add `--detach` to run Mole in the background without tying up a terminal:

```bash
mole start local prod-mysql --detach
```

Mole prints an instance ID:

```
instance id: abc123de
```

View all running tunnels:

```bash
mole show instances
```

Follow logs for a specific instance:

```bash
mole show logs --follow abc123de
```

Stop it:

```bash
mole stop abc123de
```

## Remote Tunnel

A local tunnel pulls remote services to your machine. A remote tunnel does the opposite — it exposes a local service through a remote server.

```bash
mole start remote \
  --source 0.0.0.0:8080 \        # Port to listen on at the remote server
  --destination 127.0.0.1:3000 \ # Your local service to expose
  --server user@remote.example.com
```

This makes `remote.example.com:8080` reach your local `localhost:3000`. Useful for temporarily exposing a local dev environment for external testing.

## Using ~/.ssh/config

If your jump server is already configured in `~/.ssh/config`:

```
# ~/.ssh/config
Host prod-jump
  User ec2-user
  Hostname jump.example.com
  Port 22
  IdentityFile ~/.ssh/prod-key.pem
```

Mole reads this automatically — no need to repeat the user and key:

```bash
mole start local \
  --source :3306 \
  --destination 172.16.0.10:3306 \
  --server prod-jump    # Use the Host name directly
```

## Auto-Reconnect

This is where Mole beats raw `ssh -L`. When a connection drops, Mole reconnects automatically with no manual intervention. Combine that with `--detach` and a tunnel runs indefinitely without babysitting.

Mole also sends synthetic keep-alive packets to prevent the server from disconnecting idle connections in the first place.

## AWS EC2 + ElastiCache Example

A real scenario: your dev machine isn't in the VPC, so connecting to ElastiCache (Redis) requires an EC2 bastion host.

```bash
# Save as alias with .pem key
mole add local prod-redis \
  --source :6380 \
  --destination my-cluster.0001.euw1.cache.amazonaws.com:6379 \
  --server ec2-user@10.0.1.100 \
  --key ~/aws/prod.pem

# Run in background
mole start local prod-redis --detach

# Test the connection
redis-cli -p 6380 ping
```

The same pattern works for RDS — just swap the `--destination` for your RDS endpoint.

## When to Use Mole vs Plain ssh -L

For a one-off connection, `ssh -L` is fine. Use Mole when:

- You need the same tunnel regularly (save an alias, reuse it)
- You want it running in the background long-term (auto-reconnect + `--detach`)
- You need multiple tunnels at once (multiple `--source`/`--destination` pairs)
- Your team shares tunnel configurations (commit aliases to the repo)

Set it up once, connect with one command forever.
