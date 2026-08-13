# TACO Web (frontend)

TN Academy 백오피스 ERP의 모바일 우선 웹 클라이언트입니다. Next.js 15 App Router, React 19,
TanStack Query 5와 Tailwind CSS 4를 사용하며 Vercel에 독립 배포합니다.

## 핵심 원칙

- 업무 데이터의 권위는 backend/DB다. 컴포넌트 state나 localStorage에 서버 데이터를 복제하지 않는다.
- 서버 상태는 `lib/queries/*`와 중앙 query key에서만 조회·무효화한다.
- access/refresh token은 HttpOnly cookie로 운반하고 브라우저 JS나 localStorage에 저장하지 않는다.
- 화면의 역할 조건은 UX 투영이며 backend capability/owner 검사가 최종 방어선이다.
- 대표·강사의 휴대전화 사용을 기본으로 390px부터 데스크톱까지 같은 기능을 제공한다.
- 공용 폼, modal, badge projection, status/color helper를 재사용해 같은 업무 규칙을 화면마다 다시 쓰지 않는다.

## 실행

```bash
nvm use                 # Node 22.22.3
npm ci
npm run dev             # http://localhost:3000
```

backend API는 `next.config.ts`의 same-origin rewrite로 `/api/*`를 로컬 `http://localhost:3001` 또는
server-only `API_URL`로 전달합니다. 브라우저에 backend origin이나 비밀값을 노출하지 않습니다.

## 검증 기준선

2026-08-13 TBO-98 기준입니다.

```bash
npm run lint            # error 0, warning 0
npm run typecheck       # TypeScript 0
npm test -- --run       # 82 files / 558 tests
npm run build           # 39 routes
npm audit               # production/full vulnerability 0
```

대표 로그인→캘린더는 1280x900과 390x844에서 overflow, console error, page error 0을 확인했습니다.
기술 게이트와 actual 운영 계정 UAT는 별도 증거이며 실제 사용자 데이터 확인은 각 TBO owner 체크리스트를 따릅니다.

## 구조

```text
app/                       # 39개 App Router route, page는 feature View만 조립
components/
├─ ui/                     # Button, Field, ModalShell, EmptyState, badge 등 공용 primitive
└─ layout/                 # Sidebar, Topbar, MobileBottomNav
features/
├─ account / auth / admin
├─ calendar / schedule / sessions / attendance / reports
├─ students / counsel / rooms
└─ payments / expenses / payouts / dashboard
lib/
├─ api/                    # Axios same-origin client, refresh single-flight, error parser
├─ queries/                # TanStack Query 읽기·mutation·fan-out invalidation
├─ domain/                 # 캘린더, 시차, 충돌, 상태 전이의 순수 projection
├─ hooks/                  # 공용 브라우저·권한·UI hook
└─ storage/                # 업무 데이터가 아닌 제한된 UI 선호만
types/                     # @kms545487/contracts 재노출
```

## 주요 업무 표면

- 캘린더: KST 저장, 사용자별 시차 표시, 주간/일간/기간/스플릿 뷰, drag 생성·이동·리사이즈,
  수업·가용·불가·온라인만 가능 충돌 정책, 승인 요청 점선 투영, PNG 내보내기.
- 수업·출결·리포트: 배정중→강사 배정, 과거 완료 수업 이관, 출결 자동 전이와 정정 승인,
  리포트 worklist·history·template·revision.
- 학생·상담: 학생 aggregate 등록/수정/soft-delete, 가족·보호자 조인, 상담→학생/수강 원자 전환.
- 승인센터: 가입·프로필·스케줄·출결·리포트·재무 요청의 상세 조회와 capability 기반 결정.
- 정산·재무: 시수/정산 영향 미리보기와 acknowledgement, 수납·지출·지급 상세 및 감사 이력.
- 알림: 공용 `TaskItem` projection에서 Topbar, 탭, 도착 버튼 배지를 계산하고 focus/reconnect/활성 화면
  polling으로 다른 직원의 변경을 DB에서 다시 읽는다.

## 디자인 시스템

시맨틱 색상과 밀도는 `app/globals.css`, 공용 primitive는 `components/ui`, TN 브랜드 렌더러는
`components/brand/BrandMark`가 소유합니다. 모바일 메뉴와 데스크톱 메뉴는 같은 권한 투영을 사용하고,
modal은 작은 화면에서 bottom sheet로 전환됩니다.

## 문서

- [docs/README.md](../docs/README.md): 문서 지도와 현재 검증 기준선
- [docs/FABLE.md](../docs/FABLE.md): 운영 불변식과 완료 판정
- [docs/scheduling.md](../docs/scheduling.md): 캘린더·스케줄 규칙
- [CONTRIBUTING.md](./CONTRIBUTING.md): 폴더 규칙과 새 기능 추가 방법
