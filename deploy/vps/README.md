# Utility Box VPS Deployment Prep

This directory prepares a safe VPS migration path for `Utility Box` without colliding with `HSE_PWA`.

## Current intent

- Run `Utility Box` as a separate Docker project on the same VPS.
- Keep Cloudflare only for DNS / TLS / WAF / CDN.
- Move the frontend to the VPS first.
- Keep the current Cloudflare Worker API as a temporary upstream during phase 1.
- Reserve a clean path for phase 2, where `/api` moves from the Worker to a VPS-native API.

## Isolation rules

Never place this project under `/opt/hse`.

Use this layout instead:

```text
/opt/hse
/opt/utility-box
/opt/utility-box/app
/opt/utility-box/backups
/opt/utility-box/storage
```

Keep these things separate from HSE:

- Docker project name: `utility-box`
- Docker network: `utility_box_net`
- Web port: `3100` (host-level, but keep it blocked externally with UFW)
- Future API port: `127.0.0.1:8100`
- Future DB: separate PostgreSQL database/user
- Future uploads: `/opt/utility-box/storage/uploads`

## What is ready now

This repo now includes:

- `Dockerfile.web`: builds the Vite frontend and serves it with Nginx
- `docker-compose.utility-box.yml`: isolated web service bound to `127.0.0.1:3100`
- `nginx/default.conf.template`: SPA serving + `/api` reverse proxy
- `nginx/utility-box.host.nginx.conf`: host-level Nginx server block for the domain
- `scripts/preflight-utility-box.sh`: checks path, port, Docker, and compose validity
- `scripts/deploy-utility-box.sh`: pull + rebuild + restart

## Phase 1: move frontend to VPS safely

1. On the VPS, create directories:

```bash
sudo mkdir -p /opt/utility-box/app /opt/utility-box/backups /opt/utility-box/storage
sudo chown -R $USER:$USER /opt/utility-box
```

2. Clone the repo into `/opt/utility-box/app`.

3. Create the env file from the example:

```bash
cp /opt/utility-box/app/deploy/vps/env/utility-box.web.env.example \
   /opt/utility-box/app/deploy/vps/env/utility-box.web.env
```

4. For phase 1, keep:

```text
API_UPSTREAM=https://api.utility-box.org
```

5. Run preflight:

```bash
sh /opt/utility-box/app/deploy/vps/scripts/preflight-utility-box.sh /opt/utility-box
```

6. Deploy:

```bash
sh /opt/utility-box/app/deploy/vps/scripts/deploy-utility-box.sh /opt/utility-box
```

7. Install the host-level Nginx snippet from `nginx/utility-box.host.nginx.conf`.

   If the VPS already terminates TLS on port 443, merge the same proxy rules into the
   existing HTTPS vhost instead of using the plain HTTP example as-is.

8. Point `www.utility-box.org` to the VPS in Cloudflare once the local proxy is confirmed.

## Phase 2: move API off Cloudflare

The frontend is already same-origin and only calls `/api/*`, so the cutover point is simple:

1. Build a VPS-native API service at `127.0.0.1:8100`
2. Change `API_UPSTREAM` from `https://api.utility-box.org` to `http://utility-box-api:8100`
3. Add a separate PostgreSQL database for Utility Box
4. Add uploads storage under `/opt/utility-box/storage/uploads`
5. Keep HSE unchanged

## Rollback

If phase 1 goes wrong:

1. Leave HSE untouched
2. Stop the Utility Box compose project
3. Point Cloudflare back to the previous frontend origin

Because the first phase only moves the frontend, rollback is low-risk.
