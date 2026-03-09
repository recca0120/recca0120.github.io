---
title: 'reverse_ssh: Manage Reverse Shells With Native SSH Syntax, No VPN Required'
date: '2026-03-27T09:00:00+08:00'
slug: reverse-ssh
image: featured.jpg
description: 'reverse_ssh flips SSH: target machines connect back to your server, and you connect to them with standard SSH syntax. HTTP/WebSocket/TLS transports punch through firewalls. SCP, SFTP, and port forwarding all work.'
categories:
  - Tools
tags:
  - ssh
  - reverse-shell
  - security
  - networking
  - golang
  - firewall
  - tunnel
---

You need to connect to a machine behind NAT with no public IP and inbound traffic blocked.
The usual answers are VPN or ngrok-style tunnels, but both require setup on the target.
[reverse_ssh](https://github.com/NHAS/reverse_ssh) has the target connect back to your server, then you connect using standard `ssh`. SCP, SFTP, port forwarding — all of it works.

## Architecture

Normal SSH requires you to reach the target (needs a public IP or shared network):

```
You ──SSH──→ Target (must be reachable inbound)
```

reverse_ssh flips it:

```
Target ──connects back──→ RSSH Server ←──SSH── You
```

The target only needs outbound connectivity. Firewalls almost never block outbound traffic.

## Setting Up the Server

The fastest path is Docker:

```bash
docker run -d \
  --name rssh \
  -p 3232:2222 \
  -e EXTERNAL_ADDRESS=your-server.com:3232 \
  -e SEED_AUTHORIZED_KEYS="$(cat ~/.ssh/id_ed25519.pub)" \
  -v ./data:/data \
  --restart unless-stopped \
  reversessh/reverse_ssh
```

- `EXTERNAL_ADDRESS`: your server's public address — clients use this to connect back
- `SEED_AUTHORIZED_KEYS`: your SSH public key for accessing the management console

Verify it's running:

```bash
ssh -p 3232 your-server.com
# You're now in the RSSH console
```

## Deploying a Client

On the target machine:

```bash
# Download the client binary from the server's built-in web server
curl https://your-server.com:3232/client -o rssh-client
chmod +x rssh-client
./rssh-client your-server.com:3232
```

Or generate a ready-to-run command from the RSSH console:

```
rssh> link --name my-machine --expiry 24h
# Outputs a curl command — run it on the target to connect
```

## Connecting to a Target

Once a client connects, list it in the console:

```
rssh> ls
# my-machine  192.168.1.100  linux/amd64  2m ago
```

Connect using standard SSH jump host syntax:

```bash
ssh -J your-server.com:3232 my-machine

# Or set it up in ~/.ssh/config
Host rssh-*
  ProxyJump your-server.com:3232

ssh rssh-my-machine
```

## SCP and SFTP

Everything runs over standard SSH protocol, so SCP and SFTP work without any changes:

```bash
# Copy a file to the target
scp -J your-server.com:3232 file.txt my-machine:/tmp/

# SFTP session
sftp -J your-server.com:3232 my-machine

# rsync over SSH
rsync -avz -e "ssh -J your-server.com:3232" ./local/ my-machine:/remote/
```

## Port Forwarding

```bash
# Local forward: target's port 8080 → local port 9090
ssh -J your-server.com:3232 -L 9090:localhost:8080 my-machine

# Remote forward
ssh -J your-server.com:3232 -R 8080:localhost:3000 my-machine

# SOCKS proxy (use target as a jump point)
ssh -J your-server.com:3232 -D 1080 my-machine
```

## Punching Through Restrictive Firewalls: Multiple Transports

If the target environment only allows specific outbound traffic, RSSH supports multiple transports:

```bash
# HTTP polling (works almost everywhere)
./rssh-client http://your-server.com:80

# HTTPS
./rssh-client https://your-server.com:443

# WebSocket
./rssh-client ws://your-server.com:80

# WebSocket over TLS
./rssh-client wss://your-server.com:443
```

The server can listen on multiple transports simultaneously. Clients choose whatever they can reach.

## Persistent Connection

Auto-reconnect on boot with systemd:

```bash
cat > /etc/systemd/system/rssh.service << EOF
[Unit]
Description=RSSH Client
After=network.target

[Service]
ExecStart=/usr/local/bin/rssh-client your-server.com:3232
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now rssh
```

## Use Cases

- **Remote access to NAT'd devices**: home NAS, IoT devices, office intranet machines
- **Lab management**: a fleet of VMs all connecting back to one console
- **Authorized penetration testing**: the tool is designed for this workflow
- **Cross-firewall development**: cloud CI machines reaching back to a local dev environment

## Security Notes

- Lock down `authorized_keys` on the server — only trusted operators should reach the console
- Client binaries hardcode the server fingerprint, preventing MITM
- Back up `data/keys/` — regenerating server keys breaks all deployed clients
- Don't use this on systems you don't have authorization for

## Summary

reverse_ssh's core value: use the SSH tools you already know to work with reverse connections. Once a target is connected, everything is standard SSH — `-J` jump host handles the rest.

Multiple transports mean it works even in restrictive environments. HTTP polling gets out of almost any network that has internet access at all.

## References

- [reverse_ssh GitHub Repository](https://github.com/NHAS/reverse_ssh)
- [OpenSSH ProxyJump Documentation](https://man.openbsd.org/ssh_config#ProxyJump)
- [OpenSSH Manual Pages](https://www.openssh.com/manual.html)
