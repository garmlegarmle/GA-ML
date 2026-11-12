# GA-ML / Utility Box Repo

Current production stack:
- Frontend: React + Vite
- Public domain: `https://www.ga-ml.com` behind Cloudflare
- Runtime API: VPS-native Node/Express API (`/server`)
- Database: VPS PostgreSQL
- Media: VPS local storage (`/opt/utility-box/storage/uploads`)

VPS migration prep is available in `deploy/vps/` and `docs/operations/VPS_MIGRATION.md`.
The production backend lives under `server/`.

## Content Source Of Truth
- Code/layout: GitHub repository
- 페이지 본문과 메뉴: PostgreSQL (`posts`, `site_menus`, `app_settings`)
- Uploaded images/files: local VPS storage + metadata in PostgreSQL (`media`, `media_variants`)

The app does not read runtime content from MDX/JSON files at runtime.

## 메뉴와 페이지 관리

- 관리자 메뉴에서 **메뉴 관리**를 열어 메뉴나 하위 메뉴를 만들고, 기존 페이지를 연결하거나 새 게시판을 만든다. 게시판의 표시 방식은 목록 또는 아이콘이다. 메뉴 구조는 한국어와 영어에서 별도로 관리한다.
- **페이지 만들기** 또는 **페이지 편집**을 누르면 본문 캔버스가 바로 열린다. 오른쪽에서 제목, 공개 상태, 소속 게시판을 수정하고 **페이지 저장**을 누른다. 초안은 공개 게시판과 직접 연결 메뉴에 표시되지 않는다. 그 아래 공개 하위 메뉴는 가장 가까운 공개 상위 메뉴 아래에 표시한다.
- 메뉴를 삭제하면 하위 메뉴를 한 단계 위로 옮기고 게시판의 페이지 연결만 해제한다. 페이지와 주소는 보존한다.
- 첫 실행에서 기존 도구·게임·블로그와 소개를 메뉴에 연결한다. 기존 주소와 본문은 유지하며 새 페이지의 주소는 서버가 자동으로 만든다. 태그, 별도 본문 편집, 카드 설정과 SEO 입력 기능은 제거했다. 운영 첫 화면의 기존 카드 이미지와 순서를 유지하기 위해 기존 카드 값은 표시용으로만 읽는다.

로컬 통합 검증은 빈 테스트 데이터베이스에서 API를 시작한 뒤 `GA_ML_TEST_API_URL`(루프백 주소), `GA_ML_TEST_ADMIN_USER`, `GA_ML_TEST_ADMIN_PASSWORD`를 지정하고 `node --test server/test/site-navigation.integration.test.js`를 실행한다.

## Scripts
- `npm run dev` - Vite dev server
- `npm run dev:api` - VPS-native API dev server
- `npm run dev:all` - run frontend + VPS API together
- `npm run dev:vps` - run frontend + VPS-native API together
- `npm run build` - build frontend to `dist`
- `npm run check` - TypeScript check

## Environment
Frontend (`.env`):
- `VITE_API_BASE` is optional for local development only

Production frontend calls same-origin `/api/*`, proxied by the VPS web container to the local API container.

Server env (`deploy/vps/env/utility-box.api.env`):
- `ADMIN_SESSION_SECRET`
- `ADMIN_LOGIN_USER`
- `ADMIN_LOGIN_PASSWORD` (bootstrap value; password changes are then stored in DB)
- optional: `ADMIN_TOKEN`, `MEDIA_PUBLIC_BASE_URL`

Agent handoff/runbook: see `docs/agent/CLAUDE_CODE_GUIDE.md`.

## Operations Checklist
1. Deploy API + web containers on VPS.
2. Ensure `/api/session` returns JSON.
3. Ensure admin local login works.
4. Validate:
   - `/api/session` keeps admin session after refresh.
   - public pages show `published` posts only.
   - new/edited posts appear on home/list/detail consistently.

## Security + Cost Baseline
Code-level defaults already applied:
- API write methods (`POST/PUT/DELETE/PATCH`) reject disallowed `Origin`.
- API write payloads over ~12MB are rejected early.
- Security headers are attached to all API responses.
- Public read endpoints now return cacheable `Cache-Control`:
  - `GET /api/posts` (published/public): short CDN/browser cache
  - `GET /api/menus`: 메뉴 변경을 바로 반영하기 위해 `no-store`
  - `GET /api/media/:id`: medium CDN/browser cache
  - write/admin/auth endpoints stay `no-store`
- VPS `/api` proxy preserves API cache headers.

Cloudflare Dashboard hardening to add:
1. WAF managed rules: enable default OWASP set.
2. Bot protection: enable Bot Fight Mode.
3. Rate limiting rules:
   - `/api/upload`: strict (very low burst)
   - `/api/posts` write methods: strict
   - `/api/login`: moderate
4. Cache rules:
   - bypass cache for write/auth/session paths
   - allow cache for public read paths if `Cache-Control` permits

## Security Notes
- Never commit real secret values into the repository.
- Use local-only files (`.env.local`, `CLAUDE_LOCAL_SECRETS.md`) and VPS env files.
- Local secret template: `docs/agent/CLAUDE_LOCAL_SECRETS.example.md`.
