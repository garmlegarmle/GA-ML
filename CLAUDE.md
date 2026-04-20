# GA-ML / Utility Box Agent Handoff

이 파일은 Claude Code나 다른 에이전트가 현재 운영 상태를 바로 파악하고, 같은 기준으로 이어서 작업하기 위한 단일 기준 문서입니다.

## 1. 운영 스냅샷

- 사이트: `https://www.ga-ml.com`
- 언어: 한국어 / 영어 이중 언어
- 런타임 스택: React 19 + Vite + TypeScript, Node/Express, PostgreSQL, Docker Compose, Cloudflare
- GitHub: `https://github.com/garmlegarmle/GA-ML.git`
- 프로덕션 배포 기준 브랜치: `main`
- Vercel: 사용하지 않음

2026-04-20 기준 메모:
- `origin/main`과 `origin/v3.3`는 같은 커밋 `17ffdb1`를 가리킨다.
- 최근 반영된 1차 변경은 `blog/pages` 단일 흐름화와 A3 가로 페이지 편집/표시이다.
- 다음 단계 후보는 자유 배치형 텍스트 박스/이미지 박스 편집 기능이며, 아직 구현되지 않았다.

## 2. 현재 UI / 편집 상태

현재 라이브 기준 동작은 아래와 같다.

- `blog`, `pages`
  - 공개 화면은 단일 흐름 본문이다.
  - 내용은 A3 가로 비율 페이지 단위로 나뉘어 아래로 연속 배치된다.
  - 공개 화면에서는 페이지 경계선, 카드 그림자, 페이지 카드 외곽을 숨겨서 끊김 없이 이어져 보인다.
  - 편집 화면은 `PagedEditorSurface` 기반 페이지 편집 UI를 사용한다.
- `tools`
  - 구조형 도구 페이지는 본문 위/아래 텍스트 영역과 도구 영역을 함께 사용한다.
  - `tool_layout`이 활성화된 섹션은 도구 영역과 텍스트 슬롯 조합으로 렌더링된다.
- `games`
  - 게임/프로그램 영역 뒤에 일반 본문이 이어지는 단일 흐름이다.

주의:
- `content_before_md`, `content_after_md`, `layout_blocks`는 하위 호환 때문에 데이터 모델에 남아 있다.
- 현재 `blog/pages`의 핵심 렌더링은 최종적으로 단일 흐름 본문으로 수렴한다.
- 자유 배치형 박스 편집, 텍스트 박스 리사이즈, 이미지 자유 좌표 배치, pt 직접 입력은 아직 없음.

## 3. 이어서 볼 핵심 파일

프론트엔드:
- `src/App.tsx`: 상세 페이지 렌더링 분기, 단일 흐름/A3 페이지 표시, 도구/게임 섹션 조합
- `src/components/PostEditorModal.tsx`: 관리자 에디터, 저장 payload, body/before/after 편집 분기
- `src/components/PagedEditorSurface.tsx`: 편집 화면용 A3 가로 페이지 surface
- `src/components/PagedRichColumn.tsx`: 공개 화면용 페이지 분할 렌더링
- `src/styles.css`: 페이지 카드/연속 배치/에디터 페이지 스타일
- `src/types.ts`: `PostItem`, `ToolLayout`, `PostLayoutBlock`

백엔드:
- `server/src/app.js`: `/api/posts`, `/api/session`, `/health` 포함 메인 API
- `server/src/db.js`: PostgreSQL 쿼리
- `server/src/auth.js`: 관리자 인증
- `server/src/media.js`: 업로드/미디어 처리
- `server/sql/schema.pg.sql`: 메인 스키마
- `server/sql/market_data.pg.sql`: 마켓 데이터 관련 스키마

배포:
- `deploy/vps/scripts/deploy-utility-box.sh`: 프로덕션 배포 스크립트
- `deploy/vps/docker-compose.utility-box.yml`: 웹/API/DB 컨테이너 구성
- `deploy/vps/nginx/default.conf.template`: 웹 컨테이너 내부 Nginx 설정
- `deploy/vps/README.md`: VPS 배포 상세 문서

## 4. 콘텐츠와 데이터의 소스 오브 트루스

- 코드/레이아웃: GitHub 저장소
- 포스트/카드/태그/설정: PostgreSQL
- 업로드 이미지/파일: `/opt/utility-box/storage/uploads`
- 런타임 콘텐츠를 MDX/JSON 파일에서 직접 읽지 않음

`posts` 테이블에서 자주 보는 필드:
- `section`: `blog | tools | games | pages`
- `content_md`: 단일 흐름 본문 또는 합쳐진 본문
- `content_before_md`, `content_after_md`: 구조형 tool/program 페이지의 위/아래 텍스트
- `layout_blocks`: 레거시/호환용 블록 데이터
- `tool_layout`: 도구/게임 섹션 배치 정의
- `lang`: `ko | en`

## 5. 로컬 개발

```bash
npm install
npm run dev
npm run dev:api
npm run dev:all
npm run check
npm run build
```

로컬 개발 메모:
- 프론트는 Vite, API는 `server/` 아래 Express 서버다.
- 프로덕션 프론트는 same-origin `/api/*`를 호출한다.
- 로컬 전용 메모나 시크릿은 `CLAUDE_LOCAL_SECRETS.md` 같은 gitignored 파일에만 둔다.

## 6. 표준 배포 절차

앞으로의 기본 흐름은 `feature branch -> PR -> main merge -> main 배포 -> 운영 테스트`다.

표준 순서:
1. 작업 브랜치에서 수정
2. PR 생성
3. `main`에 머지
4. VPS에서 `main` 배포
5. 라이브 도메인에서 직접 확인

표준 프로덕션 배포 명령:

```bash
ssh -o ServerAliveInterval=30 root@72.62.152.205 \
  "sh /opt/utility-box/app/deploy/vps/scripts/deploy-utility-box.sh /opt/utility-box"
```

설명:
- 위 스크립트는 서버에 체크아웃된 브랜치에서 `git pull --ff-only` 후 컨테이너를 재빌드/재시작한다.
- 프로덕션 서버의 기본 체크아웃은 `main`으로 유지한다.
- 배포 확인은 브랜치 직접 배포가 아니라 `main` 머지 후 라이브 확인을 기본으로 한다.

비표준 예외:
- 스크립트는 두 번째 인자로 브랜치를 받아 해당 브랜치로 체크아웃/추적 배포할 수 있다.
- 하지만 이 방식은 디버깅/임시 검증용으로만 보고, 정식 운영 플로우로 사용하지 않는다.

## 7. 배포 후 확인

최소 확인 목록:
- `https://www.ga-ml.com/` 응답 확인
- `https://www.ga-ml.com/ko/`, `https://www.ga-ml.com/en/` 진입 확인
- `https://www.ga-ml.com/api/session`가 JSON 반환하는지 확인
- `https://www.ga-ml.com/health`가 `{ ok: true }` 계열 JSON을 반환하는지 확인
- 관리자 로그인 확인
- 포스트 작성/수정/상태변경 확인
- 공개 사용자에게는 `published`만 보이는지 확인
- `blog/pages` 상세 화면에서 페이지 구분선 없이 연속 배치되는지 확인

## 8. 장애 대응

자주 보는 점검 포인트:
- API가 HTML을 반환하면 `deploy/vps/nginx/default.conf.template`와 컨테이너 프록시 설정부터 확인
- 로그인 실패 시 `ADMIN_LOGIN_USER`, 세션 설정, DB의 `app_settings.admin_password_hash` 확인
- 이미지가 깨지면 `/opt/utility-box/storage/uploads` 볼륨 마운트와 `media` 메타데이터 확인
- 콘텐츠 불일치 시 `/api/posts`, `/api/posts/:slug`, DB 레코드를 비교

## 9. 보안 / 로컬 파일 규칙

Git에 올리면 안 되는 것:
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`
- `CLAUDE_LOCAL_SECRETS.md`, `CLAUDE_LOCAL_NOTES.md`
- `.claude/` 같은 로컬 에이전트 작업 폴더
- 게시용 산출물 번들 폴더

민감정보 위치:
- 로컬: `CLAUDE_LOCAL_SECRETS.md`
- VPS: `deploy/vps/env/utility-box.api.env`

정리 원칙:
- Vercel 관련 파일/설정은 더 이상 유지하지 않는다.
- 배포와 무관한 로컬 산출물은 repo 밖으로 빼거나 삭제한다.
- 운영 인수인계는 이 파일을 기준으로 유지한다.

## 10. 다음 작업자를 위한 메모

다음 작업 전에 먼저 확인할 것:
- 이 파일 `CLAUDE.md`
- 현재 프로덕션 기준은 `main`
- `v3.3`는 다음 기능 작업 시작점으로 사용할 수 있다.

미완성/다음 단계:
- 텍스트 박스 자유 배치
- 이미지 박스 자유 배치
- 박스 리사이즈
- 텍스트 pt 직접 입력
- 인디자인형 페이지 조판 편집

위 항목은 아직 라이브에 들어가 있지 않다. 현재 라이브는 1차 페이지화까지만 반영된 상태다.

## 11. Compact Instructions

자동 압축 시 최소 보존 정보:
- 프로덕션 기준 브랜치: `main`
- 2026-04-20 기준 배포 반영 커밋: `17ffdb1`
- VPS: `root@72.62.152.205`
- SSH 키: `~/.ssh/id_ed25519`
- 표준 배포 명령: `ssh -o ServerAliveInterval=30 root@72.62.152.205 "sh /opt/utility-box/app/deploy/vps/scripts/deploy-utility-box.sh /opt/utility-box"`
- Vercel은 사용하지 않음
- 단일 기준 문서는 이 파일 `CLAUDE.md`
