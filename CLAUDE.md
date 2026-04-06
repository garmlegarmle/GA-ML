# GA-ML / Utility Box — Claude Code 프로젝트 가이드

이 파일은 Claude Code(또는 다른 AI 에이전트)가 이 프로젝트를 빠르게 파악하고 이어서 작업할 수 있도록 만든 안내서입니다.

---

## 1. 프로젝트 개요

- **사이트 주소**: `https://www.ga-ml.com`
- **언어**: 한국어(ko) / 영어(en) 이중 언어 CMS 사이트
- **배포**: VPS (Docker Compose) + Cloudflare CDN
- **GitHub**: `https://github.com/garmlegarmle/GA-ML.git`
- **운영 브랜치**: `v2.8` (현재 프로덕션)

---

## 2. 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 19 + Vite + TypeScript |
| 스타일 | 단일 `src/styles.css` |
| API 서버 | Node.js + Express (`/server/src`) |
| 데이터베이스 | PostgreSQL 16 |
| 컨테이너 | Docker Compose (`/deploy/vps/`) |
| 리버스 프록시 | Nginx (컨테이너 내) |

---

## 3. 주요 폴더 구조

```
/src                    React 앱 (화면/에디터/UI)
  App.tsx               메인 라우터 + 레이아웃
  styles.css            전체 스타일 (단일 파일)
  components/           UI 컴포넌트
    PostEditorModal.tsx 관리자 포스트 에디터 (핵심)
    TrendAnalyzerTool.tsx
    ChartInterpretationTool.tsx
  lib/
    api.ts              API 호출 함수
    site.ts             다국어 문구 t(lang, key)
  types.ts              공유 TypeScript 타입
/server/src             VPS API (Express)
  app.js                라우트 + 미들웨어
  db.js                 PostgreSQL 쿼리
  auth.js               관리자 인증
  media.js              파일 업로드
/server/sql
  schema.pg.sql         DB 스키마 정의
/deploy/vps
  docker-compose.yml    컨테이너 구성
  scripts/deploy-utility-box.sh  VPS 배포 스크립트 (VPS에서 실행)
  nginx/default.conf.template    Nginx 프록시 설정
/docs/agent
  CLAUDE_CODE_GUIDE.md  상세 작업 안내서 (이 파일의 원본)
CLAUDE_LOCAL_SECRETS.md 로컬 전용 비밀정보 (gitignore, GitHub 비공개)
```

---

## 4. 데이터 모델 (핵심)

**posts 테이블 주요 컬럼:**
- `section`: `'blog'` | `'tools'` | `'pages'` | `'games'`
- `content_md`: 본문 (games 섹션 또는 단일 컬럼 포스트)
- `content_before_md`: 좌측 컬럼 본문 (non-games 포스트)
- `content_after_md`: 우측 컬럼 본문 (non-games 포스트)
- `lang`: `'ko'` | `'en'`

**콘텐츠 소스 오브 트루스:**
- 코드/레이아웃 → GitHub
- 포스트/카드/태그 → PostgreSQL
- 업로드 이미지/파일 → VPS 로컬 스토리지 (`/opt/utility-box/storage/uploads`)
- MDX/JSON 파일에서 런타임 콘텐츠를 직접 읽지 않음

---

## 5. 레이아웃 규칙

- **games 섹션**: 단일 컬럼, `content_md` 사용
- **blog/tools/pages 섹션**: 좌/우 2열 독립 스크롤 레이아웃
  - 좌측: `content_before_md`
  - 우측: `content_after_md`
  - CSS 클래스: `detail-layout--split`

---

## 6. 관리자 에디터 (PostEditorModal.tsx)

- `usesColumnEditor = section !== 'games'` → 좌/우 분리 입력창 사용 여부
- `activeEditor`: `'before'` | `'after'` | `'body'`
- non-games 포스트는 before/after 에디터, games 포스트는 body 에디터

---

## 7. 로컬 개발

```bash
npm install          # 의존성 설치
npm run dev          # 프론트 Vite dev server
npm run dev:api      # API 서버
npm run dev:all      # 프론트 + API 동시 실행
npm run check        # TypeScript 체크
npm run build        # 프로덕션 빌드
```

---

## 8. 배포 절차

1. 로컬에서 커밋 & GitHub 푸시
   ```bash
   git add <파일들>
   git commit -m "..."
   git push origin v2.8
   ```

2. VPS에서 배포 스크립트 실행
   ```bash
   ssh -i ~/.ssh/id_ed25519 root@72.62.152.205 \
     "sh /opt/utility-box/app/deploy/vps/scripts/deploy-utility-box.sh /opt/utility-box v2.8"
   ```

> SSH 키: `~/.ssh/id_ed25519`
> VPS: `root@72.62.152.205` (포트 3100)
> 비밀정보 전체: `CLAUDE_LOCAL_SECRETS.md` 참고

---

## 9. 작업 규칙

| 작업 종류 | 수정할 파일 |
|-----------|-------------|
| UI/레이아웃 | `src/App.tsx`, `src/components/*`, `src/styles.css` |
| API 로직 | `server/src/app.js`, `server/src/db.js` |
| 인증 | `server/src/auth.js` |
| DB 스키마 | `server/sql/schema.pg.sql` |
| Nginx/라우팅 | `deploy/vps/nginx/default.conf.template` |
| 다국어 문구 | `src/lib/site.ts`의 `t(lang, key)` |
| 타입 정의 | `src/types.ts` |

---

## 10. 운영 체크리스트 (배포 후 확인)

1. `https://www.ga-ml.com/en/`, `/ko/` 접속 확인
2. `/api/posts` → JSON 반환 확인 (HTML이면 Nginx 프록시 이슈)
3. 관리자 로그인 확인
4. 관리자 포스트 작성/수정/삭제/상태변경 확인
5. 공개 사용자는 `published` 포스트만 보이는지 확인

---

## 11. 장애 대응

| 증상 | 확인 사항 |
|------|-----------|
| API가 HTML 반환 | `deploy/vps/nginx/default.conf.template` + Nginx 재시작 |
| 로그인 실패 | `ADMIN_LOGIN_USER`, DB `app_settings.admin_password_hash`, 세션 쿠키 |
| 데이터 불일치 | `/api/posts` 직접 조회 후 UI 응답과 비교 |
| 이미지 안 보임 | VPS 스토리지 볼륨 마운트 (`/opt/utility-box/storage/uploads`) 확인 |

---

## 12. 보안 규칙

**GitHub에 커밋 금지:**
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`
- `CLAUDE_LOCAL_SECRETS.md`, `CLAUDE_LOCAL_NOTES.md`

**민감정보 위치:**
- 로컬: `CLAUDE_LOCAL_SECRETS.md` (gitignore)
- VPS: `deploy/vps/env/utility-box.api.env`
