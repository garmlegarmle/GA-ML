# GA-ML / Utility Box — Claude Code 프로젝트 가이드

이 파일은 Claude Code(또는 다른 AI 에이전트)가 이 프로젝트를 빠르게 파악하고 이어서 작업할 수 있도록 만든 안내서입니다.

---

## 1. 프로젝트 개요

- **사이트 주소**: `https://www.ga-ml.com`
- **언어**: 한국어(ko) / 영어(en) 이중 언어 CMS 사이트
- **배포**: VPS (Docker Compose) + Cloudflare CDN
- **GitHub**: `https://github.com/garmlegarmle/GA-ML.git`
- **운영 브랜치**: `main` (현재 프로덕션)

---

## 2. 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 19 + Vite + TypeScript |
| 스타일 | `src/styles.css`와 `src/navigation.css` |
| API 서버 | Node.js + Express (`/server/src`) |
| 데이터베이스 | PostgreSQL 16 |
| 컨테이너 | Docker Compose (`/deploy/vps/`) |
| 리버스 프록시 | Nginx (컨테이너 내) |

---

## 3. 주요 폴더 구조

```
/src                    React 앱 (화면/에디터/UI)
  App.tsx               메인 라우터 + 레이아웃
  styles.css            기존 공개 화면과 편집 캔버스 스타일
  navigation.css        사이드 메뉴, 게시판과 관리자 화면 스타일
  components/           UI 컴포넌트
    SiteNavigation.tsx  사이드 메뉴와 탐색 경로
    MenuManager.tsx     메뉴와 게시판 설정
    BodyLayoutEditor.tsx  통합 페이지 편집기
    TrendAnalyzerTool.tsx
    ChartInterpretationTool.tsx
  lib/
    api.ts              API 호출 함수
    site.ts             다국어 문구 t(lang, key)
  types.ts              공유 TypeScript 타입
/server/src             VPS API (Express)
  app.js                페이지 API와 공통 미들웨어
  site-menus.js         메뉴 API와 최초 데이터 연결
  db.js                 PostgreSQL 쿼리
  auth.js               관리자 인증
  media.js              파일 업로드
/server/sql
  schema.pg.sql         DB 스키마 정의
/deploy/vps
  docker-compose.utility-box.yml  컨테이너 구성
  scripts/deploy-utility-box.sh  VPS 배포 스크립트 (VPS에서 실행)
  nginx/default.conf.template    Nginx 프록시 설정
/docs/agent
  CLAUDE_CODE_GUIDE.md  상세 작업 안내서 (이 파일의 원본)
CLAUDE_LOCAL_SECRETS.md 로컬 전용 비밀정보 (gitignore, GitHub 비공개)
```

---

## 4. 데이터 모델 (핵심)

- `posts.menu_id`: 페이지가 속한 게시판. 메뉴 간 상위 관계는 `site_menus.parent_id`에 저장한다.
- `posts.section`, `posts.slug`: 기존 주소와 도구·게임을 유지하는 내부 식별자. 새 페이지 주소는 자동 생성한다.
- `body_layout_json`: 인디자인 방식 캔버스. 이전 본문 필드는 기존 페이지를 그대로 표시하기 위해 보존한다.
- 페이지와 메뉴는 PostgreSQL, 업로드는 VPS 저장소에 보관한다. 메뉴 삭제는 페이지를 삭제하지 않는다.
- 첫 마이그레이션은 `site_menus_migrated_v1`로 기록한다. 사용자가 지운 메뉴는 재시작해도 다시 생성되지 않는다.

## 5. 공개 탐색

언어별 사이드 메뉴에는 기존 페이지 링크와 게시판을 함께 둘 수 있다. 게시판은 하위 메뉴와 소속 공개 페이지를 목록이나 아이콘으로 표시한다. 페이지 탐색 경로는 메뉴 계층을 따른다. 도구와 게임의 기존 주소와 실행 화면은 유지한다.

## 6. 관리자 편집

`BodyLayoutEditor.tsx`가 새 페이지와 기존 페이지 모두에 사용된다. 본문 캔버스와 오른쪽의 제목·공개 상태·소속 메뉴를 한 번에 저장한다. 기존 페이지 설정만 바꾸면 본문 배치는 바뀌지 않는다. 초안은 관리자만 읽을 수 있다.

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

1. 운영 VPS의 실제 체크아웃과 원격 `main`을 확인한다. 작업 브랜치에서 검증한 변경을 커밋·푸시하고 PR을 통해 `main`에 머지한다. 데이터베이스 스키마 변경이 있으면 배포 전에 운영 백업을 만든다.

2. VPS에서 배포 스크립트 실행
   ```bash
   ssh -i ~/.ssh/id_ed25519 root@72.62.152.205 \
     "sh /opt/utility-box/app/deploy/vps/scripts/deploy-utility-box.sh /opt/utility-box main"
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
2. `/api/menus?lang=ko`, `/api/menus?lang=en`과 `/api/session`의 JSON 응답 확인
3. 관리자 로그인 확인
4. 검증 환경에서 메뉴·하위 메뉴 생성, 기존 페이지 연결, 두 게시판 표시, 페이지 작성·공개 전환 확인
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

---

## 13. Compact Instructions

자동 압축(auto-compact) 시 반드시 보존할 정보:

- **VPS 접속**: `root@72.62.152.205`, SSH 키 `~/.ssh/id_ed25519`
- **배포 명령**: `ssh -i ~/.ssh/id_ed25519 root@72.62.152.205 "sh /opt/utility-box/app/deploy/vps/scripts/deploy-utility-box.sh /opt/utility-box main"`
- **현재 운영 브랜치**: `main`
- **GitHub 리모트**: `https://github.com/garmlegarmle/GA-ML.git`
- **진행 중인 작업 및 미완성 사항** (있으면 보존)
- **발견된 버그 및 수정 내용 요약**
- **이 파일(CLAUDE.md)의 존재** — 새 세션에서 반드시 먼저 읽을 것
