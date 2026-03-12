# Utility Box VPS Migration Plan

## Objective

Move `Utility Box` away from Cloudflare Pages hosting into a VPS-based deployment that can coexist with `HSE_PWA` on the same server without shared state or port collisions.

## Recommended operating model

- Cloudflare stays in front for DNS, TLS, WAF, and cache
- `Utility Box` runs as its own deployment root under `/opt/utility-box`
- `HSE_PWA` remains isolated in `/opt/hse`
- Utility Box uses its own Docker project, network, env, logs, and later its own database

## Migration phases

### Phase 1

Move the frontend only.

- Deploy the React/Vite frontend to the VPS on `127.0.0.1:3100`
- Use host Nginx to route `www.utility-box.org` to that container
- Keep `/api` proxied to the existing Cloudflare Worker
- This removes Cloudflare Pages from the critical path without rewriting the backend yet

### Phase 2

Move the API and data services.

- Replace the Worker with a VPS-native API on `127.0.0.1:8100`
- Replace D1 with PostgreSQL
- Replace R2-backed uploads with local storage or object storage, depending on ops preference
- Update the frontend reverse proxy so `/api` points to the local API

## Non-negotiable separation from HSE

- Do not reuse `/opt/hse`
- Do not reuse HSE Docker networks or compose project name
- Do not reuse HSE database or database user
- Do not reuse HSE upload paths
- Do not publish Utility Box directly on public high ports

## Reserved names

- Project root: `/opt/utility-box`
- Compose project: `utility-box`
- Container prefix: `utility-box-*`
- Network: `utility_box_net`
- Web loopback port: `3100`
- Future API loopback port: `8100`

## Required server work

1. Create `/opt/utility-box/*` directories
2. Clone the repo into `/opt/utility-box/app`
3. Add the env file at `deploy/vps/env/utility-box.web.env`
4. Run `deploy/vps/scripts/preflight-utility-box.sh`
5. Deploy with `deploy/vps/scripts/deploy-utility-box.sh`
6. Add the provided Nginx server block
7. Change Cloudflare DNS from Pages to the VPS when verified

## Why this is safe

- HSE stays untouched
- Utility Box binds only to `127.0.0.1:3100`
- The phase 1 cutover has no shared DB or filesystem writes
- Rollback is just DNS + container stop

## What still needs implementation later

- Native VPS API service
- PostgreSQL migration from D1 data
- Upload pipeline for VPS storage
- Session/auth backend without Worker runtime
