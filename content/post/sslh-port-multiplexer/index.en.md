---
title: 'sslh: Run HTTPS and SSH on Port 443 at the Same Time'
date: '2026-03-28T09:00:00+08:00'
slug: sslh-port-multiplexer
image: featured.jpg
description: 'sslh is a protocol multiplexer that lets SSH, HTTPS, and OpenVPN share a single port. The most common use case: hide SSH on port 443 to get through firewalls that only allow HTTP/HTTPS.'
categories:
  - Tools
tags:
  - sslh
  - ssh
  - networking
  - security
  - linux
---

The corporate or university network only allows ports 80 and 443 out. SSH on 22 is blocked.
Getting back to your home server means VPN or a web terminal, both annoying.
[sslh](https://github.com/yrutschle/sslh) lets your server accept both HTTPS and SSH on 443. The firewall sees 443. SSH is hidden inside it.

## How It Works

sslh sits in front of port 443. When a connection arrives, it reads the first packet, identifies the protocol, and forwards to the right backend.

```
Incoming connection → 443
                          ↓
                       sslh (inspects first packet)
                          ├── SSH packet  → local :22
                          └── TLS packet  → local nginx:443
```

From the SSH client's perspective, it connected to 443 and got SSH. From nginx's perspective, it's still listening on its own port. sslh sits between them.

Supported protocols: SSH, TLS/HTTPS, HTTP, OpenVPN, SOCKS5, tinc, XMPP, and custom regex patterns.

## Installation

```bash
# Ubuntu / Debian
sudo apt install sslh

# Arch
sudo pacman -S sslh

# macOS
brew install sslh

# Docker
docker pull ghcr.io/yrutschle/sslh:latest
```

## Quick Start: Command Line

Test it first before setting up a service:

```bash
# Port 443 accepts SSH (→ local 22) and HTTPS (→ local nginx 8443)
sudo sslh --listen=0.0.0.0:443 \
          --ssh=127.0.0.1:22 \
          --tls=127.0.0.1:8443
```

Before running this, move nginx off 443 to 8443 (sslh now owns 443):

```nginx
# /etc/nginx/sites-available/default
server {
    listen 8443 ssl;  # moved from 443
    # everything else stays the same
}
```

## Config File

For production, use a config file at `/etc/sslh.cfg`:

```cfg
# /etc/sslh.cfg

verbose: 0;
foreground: false;
inetd: false;
numeric: false;
transparent: false;

# sslh listens here
listen:
(
    { host: "0.0.0.0"; port: "443"; }
);

# Protocol routing
protocols:
(
    { name: "ssh";     host: "127.0.0.1"; port: "22";   log_level: 0; },
    { name: "tls";     host: "127.0.0.1"; port: "8443"; log_level: 0; },
    # catch-all: anything unrecognized goes to nginx
    { name: "anyprot"; host: "127.0.0.1"; port: "8443"; log_level: 0; }
);
```

Enable and start:

```bash
sudo systemctl enable sslh
sudo systemctl start sslh
sudo systemctl status sslh
```

## Client Connection

SSH to port 443:

```bash
# Explicit port
ssh -p 443 user@yourserver.com

# Or set it permanently in ~/.ssh/config
Host myserver
    HostName yourserver.com
    Port 443
    User yourname
```

After that, `ssh myserver` works without `-p 443`. HTTPS needs no changes — browsers connect to `https://yourserver.com` as usual.

## Docker Compose

If you run services in Docker, sslh fits naturally as a container in front of nginx:

```yaml
# docker-compose.yml
services:
  sslh:
    image: ghcr.io/yrutschle/sslh:latest
    ports:
      - "443:443"
    command: >
      --foreground
      --listen=0.0.0.0:443
      --tls=nginx:443
      --ssh=sshd:22
    depends_on:
      - nginx
      - sshd
    cap_add:
      - NET_RAW
      - NET_BIND_SERVICE
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    # nginx doesn't expose 443 externally — sslh handles that
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

  sshd:
    image: linuxserver/openssh-server
    environment:
      - PUBLIC_KEY_FILE=/keys/authorized_keys
    volumes:
      - ./keys:/keys
```

Neither nginx nor sshd need to expose ports externally. sslh multiplexes everything.

## Adding OpenVPN

If OpenVPN is also blocked, sslh handles that too:

```cfg
protocols:
(
    { name: "ssh";     host: "127.0.0.1"; port: "22";   },
    { name: "openvpn"; host: "127.0.0.1"; port: "1194"; },
    { name: "tls";     host: "127.0.0.1"; port: "8443"; },
    { name: "anyprot"; host: "127.0.0.1"; port: "8443"; }
);
```

Set your OpenVPN client's remote to `yourserver.com 443`. sslh identifies the OpenVPN handshake and forwards to 1194.

## sslh vs Other Approaches

| Approach | Pros | Cons |
|---|---|---|
| sslh | Lightweight, multi-protocol, transparent to clients | Needs root, backend loses real client IP (needs transparent mode) |
| [reverse_ssh](/en/p/reverse-ssh/) | Target machine doesn't need a public IP | Requires a relay server |
| HAProxy | More powerful, PROXY protocol support | More complex config |
| Nginx stream | Simple, native TLS SNI routing | Can't demux SSH from TLS |

If the goal is "SSH through a firewall," sslh is the most direct solution. If the target machine has no public IP at all, [reverse_ssh](/en/p/reverse-ssh/) is a different approach worth knowing.

## Things to Know

**Backend loses real client IP**: By default sslh NATs connections, so backend services see `127.0.0.1` instead of the real client IP. If you need real IPs for fail2ban or access logs, enable transparent proxy mode — it requires extra iptables rules.

**Move nginx off 443 first**: sslh needs to own 443. Whatever was listening there before needs to move to another port.

**CVE history**: sslh has had a few CVEs over the years. Keep it updated; not a reason to avoid it.

## Summary

Multiple services, one port. sslh routes by inspecting the first packet. The most common setup is SSH on 443, getting through firewalls that only allow HTTPS. Once configured, SSH clients just change port from 22 to 443 — everything else stays the same.

## References

- [sslh GitHub Repository](https://github.com/yrutschle/sslh)
- [sslh Configuration Documentation](https://github.com/yrutschle/sslh/blob/master/doc/config.md)
- [OpenSSH Client Configuration (ssh_config man page)](https://man.openbsd.org/ssh_config)
