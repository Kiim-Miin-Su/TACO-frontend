# TACO ERP 디자인 표준 (v2 — 2026-07-06 제안, 레퍼런스 반영)

> 목적: 가독성·컴팩트함·자연스러운 UX 흐름·오버플로 제로를 코드 수준에서 강제한다.
> 근거: 2026-07-06 frontend/ 전수 감사(45개 TSX) + 라이브 스크린샷 7장(`docs/ux-qa/design-audit-2026-07-06/`).
> 레퍼런스: ① Lantiv Scheduling Studio(정보 구조·스케줄링 UX) ② 인프런(시각 언어·타이포·톤 — 색상 제외).
> 상태: **승인·시행 중** — Phase A(`619eeeb`)·Phase B(`8ff25cf`) 완료, Phase C는 다음 스프린트(docs/TODO.md 🎨 섹션). 이 문서가 프론트 디자인의 단일 기준이다.

---

## R. 레퍼런스 — 무엇을 가져오는가

### R1. Lantiv Scheduling Studio → 정보 구조·스케줄링 UX (캘린더·출석부·데이터 밀집 화면)

Lantiv의 핵심은 "**Scheduling is all about seeing the BIG picture**" — 한 화면에서 그리드·리소스·상세를 동시에 본다.

| Lantiv 패턴 | TACO 적용 |
|---|---|
| 멀티 페인: 그리드 + 리소스 목록 + 상세가 한 화면 | 캘린더 스플릿뷰·우측 유저별 패널(기구현) 유지·강화. 패널 전환 없이 조작 |
| 리소스 중심 개인 스케줄(강사/학생/강의실별) | 우측 패널 탭(학생/강사/강의실) 유지, 클릭=개인 스케줄 필터(기구현) |
| 실시간 충돌 감지·시각 표시 | 충돌·가용 밴드 시각화(기구현) 유지, 색은 §7 톤만 사용 |
| 데스크톱 앱급 컴팩트 툴바 — 아이콘·소형 버튼, 세로 공간 절약 | 캘린더 상단 3행(뷰·내비 / 열조절 / 필터카드) → **2행으로 압축**, 필터는 토글 |
| 드래그&드롭·복제가 1차 조작 | 기구현 유지. 조작법 설명은 부제에서 ⓘ 팝오버로 이동 |

### R2. 인프런 → 시각 언어 (전 화면 공통)

한국어 교육 서비스의 검증된 톤: 흰 서피스 + 얇은 회색 경계 + **그린 브랜드 액센트** + Pretendard 타이포.

| 인프런 패턴 | TACO 적용 |
|---|---|
| Pretendard 폰트 | `--font-sans` 최우선을 Pretendard Variable로 교체(OFL asset을 `public/`에서 로컬 서빙) |
| 라운드 8~12px, 그림자 최소, 경계는 연한 회색 | `--radius-md` 6→**8px**, 카드 그림자 resting 유지(과한 그림자 금지) |
| 제목 700 / 본문 400의 뚜렷한 굵기 대비, 넉넉한 행간 | §3 타이포 스케일에 행간 포함 정의, 페이지 h1은 `font-bold`로 상향 |
| 칩·태그는 rounded-full 연회색 | 기존 badge 체계와 일치 — 유지 |

> 색상은 인프런을 따르지 **않는다** — 브랜드 컬러는 GitHub(Primer)/ERP 계열 유지 결정(2026-07-06 컨펌). 인프런에서는 타이포·라운드·굵기 대비·여백 감각만 차용.

---

## 0. 감사 요약 (현재 문제)

| # | 문제 | 심각도 | 근거 |
|---|------|--------|------|
| 1 | 페이지 max-width 12종 난립 (720~1560px + 40vw/60%/95vw) | HIGH | StudentsView 1180 vs AdminShell 760 vs PayoutsView 1000 |
| 2 | window.prompt/confirm/alert 5곳+ (급여수정·퇴원처리 등) | HIGH | PayoutsView L123·127, StudentsView L108, ReportWriteView L153 |
| 3 | Field 컴포넌트 파일마다 중복 정의 | HIGH | StudentForm L165 ≡ PayoutsView L372 |
| 4 | 반응형 미보호: 고정 grid-cols-7, 320px 고정 사이드 | HIGH | CounselCalendar, ReportWriteView |
| 5 | arbitrary 텍스트 크기 311곳 (`text-[13px]` 등) | MED | 전 파일 |
| 6 | 인라인 style로 CSS 변수 참조 50곳+ (`borderColor: 'var(--color-line)'`) | MED | 토큰이 @theme에 있으므로 `border-line` 클래스가 이미 생성됨 — 전부 치환 가능 |
| 7 | 빈 상태(empty state) 문구·위치·톤 제각각 | MED | 카드마다 상이 |
| 8 | 대시보드: 카드 5개가 2열 그리드에 비대칭 배치, StatCard 1개가 4열 그리드에 홀로 | MED | 스크린샷 dashboard.png |
| 9 | 헤더 부제에 조작 설명서가 상주 (캘린더 "드래그 이동 · Ctrl+…") | MED | ScheduleCalendar L1626 |
| 10 | 하드코딩 날짜("2026년 6월"), 죽은 메뉴(설정 href="#") | LOW | DashboardView L122, Sidebar |

라이브 검증: 1440px 뷰포트에서 수평 오버플로 0건 (7페이지 DOM 실측). 오버플로 위험은 좁은 화면(<1280px)에서 발생.

---

## 1. 디자인 원칙

1. **가독성** — 본문 13px 유지(ERP 밀도), Pretendard(§R2), 대비는 fg/fg-muted/fg-subtle 3단만 사용. 숫자는 항상 `mono`(tabular-nums) + 우측 정렬.
2. **컴팩트 (Lantiv)** — 화면 최상단 ~200px 안에 "제목 + 핵심 액션 + 첫 데이터 행"이 보여야 한다. 빈 섹션은 한 줄로 축약. 데이터 밀집 화면은 페인 전환 없이 한 화면에서 본다.
3. **흐름** — 페이지의 첫 화면은 항상 *조회*(목록/현황). *생성*은 헤더 우측 버튼 → 접이식 패널/모달. (현재 학생 페이지는 등록 폼이 목록을 밀어냄 — 역전 대상)
4. **오버플로 제로** — 모든 table은 스크롤 래퍼 안에, 모든 flex 텍스트는 `min-w-0 truncate`, 셀 밖으로 나가는 요소는 클립(캘린더 B-6 방식 준용).
5. **문서화** — 이 문서가 기준. 신규 화면은 §2 배정표에 행 추가 없이는 arbitrary max-width 금지.
6. **톤 (인프런)** — 흰 서피스·연한 경계·그린 브랜드 액센트·라운드 8px. 색은 토큰만, 직접 hex 금지.

---

## 2. 레이아웃 규격 — max-width 3단계

### 2.1 토큰 (globals.css `@theme`)

```css
--container-page-form: 720px;   /* max-w-page-form */
--container-page: 1200px;       /* max-w-page      */
--container-page-wide: 1560px;  /* max-w-page-wide */
```

페이지 래퍼는 단 한 가지 형태만 허용:

```tsx
<div className="p-6 max-w-page mx-auto space-y-6">
```

### 2.2 페이지별 배정표 (핵심 페이지 → 이후 전체)

| 페이지 | 현재 | 표준 | 비고 |
|---|---|---|---|
| 대시보드 (admin) | 1200 | **page** (1200) | 유지 |
| 대시보드 (강사/학생) | 860/760 | **page-form** (720) | To-do 리스트 중심 |
| 캘린더 | 1560 | **page-wide** (1560) | 유지 |
| 강사 페이 | 1000 | **page** (1200) | 근거 테이블 6열 여유 |
| 출석부 | 1280 | **page-wide** (1560) | 회차 매트릭스 가로 확장 |
| 학생·부모 | 1180 | **page** (1200) | |
| 승인 센터 | 1100 | **page** (1200) | |
| 수업 보고서 | 1100/1200 | **page** (1200) | |
| 결제·지출 목록 | 1100 | **page** (1200) | |
| 결제·지출 폼/디테일 | 720/760 | **page-form** (720) | |
| 상담 | 1100 | **page** (1200) | |
| 관리자(코스·이벤트) | 760~1100 | **page** (1200) | AdminShell로 통일 |
| 로그인/가입 | 360/400 | 400 (AuthShell 고정) | 예외 허용 |

### 2.3 컴포넌트 폭 규칙

| 컴포넌트 | 규칙 |
|---|---|
| SectionCard | 부모 폭 100%. 자체 max-width 금지 |
| 테이블 | `TableWrap`(overflow-x-auto) 래퍼 필수 + 열별 `min-w` 지정(§6) |
| 모달 | sm 400 / md 560 / lg 720 3단. `max-w-[95vw]` 병행 유지 |
| 우측 패널(캘린더) | 고정 280px, `shrink-0`, 내부 truncate |
| 폼 grid | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — 고정 열수 금지 |
| Topbar 검색 | `w-80 max-w-[40vw]` 유지 |

### 2.4 높이 규격 (2026-07-06 추가 — width와 동급으로 강제)

원칙: **화면(뷰포트)을 넘어 자라는 요소는 반드시 자기 안에서 스크롤**하고, 빈 상태에서 레이아웃이 무너지지 않게 최소 높이를 지킨다.

| 대상 | 규칙 |
|---|---|
| 모달 | `max-h-[85vh]` + 본문 `overflow-y-auto`(헤더·푸터는 고정). 세로 중앙 배치 유지 |
| 팝오버·드롭다운(알림, ⓘ 도움말, Combobox 목록) | `max-h-[320px] overflow-y-auto` |
| 대시보드 To-do 리스트(TaskList) | 카드당 `max-h-[300px] overflow-y-auto` — 항목 폭주 시 카드가 페이지를 밀어내지 않게 |
| 빈 상태(EmptyState) | 한 줄(p-4) 고정 — 0건 섹션이 공간 점유 금지. 별도 min-h 금지 |
| 풀그리드 화면(캘린더·출석부 매트릭스) | 페이지가 아니라 **그리드 컨테이너가 스크롤 소유**: `flex-1 min-h-0` + 내부 `overflow-auto` |
| 사이드 패널(캘린더 우측) | `min-h-0` + 리스트 영역 `overflow-y-auto` — 패널이 그리드보다 길어지지 않게 |
| textarea | `min-h-[96px]`(기본)·`max-h-[40vh]`, resize-y 허용 |
| 페이지 최소 높이 | 명시 금지 — 콘텐츠 높이를 따른다(스크롤은 AppShell `main`이 소유) |

검증: QA 하네스에서 `scrollHeight > innerHeight`인 요소 중 overflow 미소유 요소를 스캔(§6-5와 동일한 방식의 세로판).

---

## 3. 타이포 스케일 — arbitrary 제거

`@theme`에 5단 정의, `text-[NNpx]` 신규 사용 금지:

```css
--text-title: 20px;    --text-title--line-height: 28px;   /* 페이지 h1 */
--text-section: 15px;  --text-section--line-height: 22px; /* 섹션 h2 */
--text-body: 13px;     --text-body--line-height: 20px;    /* 본문·테이블 */
--text-caption: 12px;  --text-caption--line-height: 18px; /* 부제·메타 */
--text-micro: 11px;    --text-micro--line-height: 16px;   /* 배지 보조 */
```

- 페이지 제목: `text-title font-bold`(인프런식 굵기 대비), 섹션 제목 `text-section font-semibold`, 부제: `text-caption text-fg-muted`
- 14px(SectionCard 제목)는 section(15px)으로 흡수, 26px(StatCard 값)는 예외 토큰 `--text-stat: 26px`
- 기존 311곳은 sed 일괄 치환 가능한 1:1 매핑 (13→body, 12→caption, 11→micro, 20→title, 15→section)

**폰트 (§R2)**: `public/fonts/pretendard`의 OFL CSS/woff2를 직접 로컬 서빙한다. 빌드/runtime npm
dependency는 두지 않으며 asset의 license와 원본 URL은 CSS header가 권위다. 스택:

```css
--font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
  "Segoe UI", "Noto Sans KR", "Apple SD Gothic Neo", Helvetica, Arial, sans-serif;
```

## 4. 간격 표준

| 위치 | 값 |
|---|---|
| 페이지 패딩 | `p-6` (24px) 고정 |
| 페이지 내 섹션 간 | `space-y-6` |
| 카드 내부 패딩 | `p-4` (`.card-pad`) |
| 카드 그리드 | `gap-4` |
| 헤더 블록 | h1 + 부제 `mt-0.5`, 헤더 아래 `mb-5` → PageHeader 컴포넌트로 고정 |
| 폼 필드 간 | `gap-3` |

---

## 5. 공용 컴포넌트 (신설·이관)

| 컴포넌트 | 대체 대상 | 스펙 |
|---|---|---|
| **PageHeader** | 각 뷰 상단 12곳+ 수기 헤더 | `title, sub?, actions?, badge?` — 제목/부제/우측 액션 배치 고정 |
| **Field** | StudentForm·PayoutsView 등 중복 로컬 정의 | `components/ui/Field.tsx` 로 승격 (label + children + hint?/error?) |
| **EmptyState** | "…없습니다" 수기 20곳+ | `message, action?` — `p-4 text-body text-fg-subtle` 단일 형태. **0건 섹션은 카드 본문 대신 한 줄 컴팩트 표시** |
| **PromptModal** | `window.prompt` 3곳 (급여수정 등) | ReasonModal 일반화: `title, fields[], onSubmit` |
| **ConfirmModal** | `window.confirm` 2곳 (퇴원 처리 등) | danger 톤 버튼 + 설명 |
| **TableWrap** | 래퍼 없는 table 전부 | `overflow-x-auto` + 선택적 `minWidth` |

기존 유지: SectionCard, StatCard, Badge, StatusDot, Combobox, MonthCalendar, tokens.ts(Tone).

### 5.5 View 분리 기준 — 기능·책임 단위 (2026-07-06 추가)

한 화면에 여러 책임이 섞이면 페이지·모달·패널로 분리한다. 기준:

| 형태 | 쓰는 경우 | 예 |
|---|---|---|
| **페이지** | 조회·워크플로 허브(목록/현황/그리드). URL로 공유·복귀할 가치가 있는 단위 | 학생 목록, 캘린더, 정산 목록 |
| **서브페이지** (`/x/new`, `/x/[id]`) | 필드 6개 이상 복잡 폼, 상세 화면 | 결제 생성, 지출 상세 |
| **모달** (Prompt/Confirm/Reason) | 필드 1~5개의 짧은 입력, 파괴적 액션 확인. 컨텍스트(목록)를 벗어나면 안 되는 작업 | 급여 수정, 반려 사유, 퇴원 확인 |
| **접이식 패널** | 페이지 안에서 가끔 쓰는 생성 폼 — 기본 접힘, 헤더 버튼으로 토글 | 학생 등록 |
| **팝오버** | 조작 도움말·알림 등 읽기 전용 보조 정보 | 캘린더 단축키 ⓘ |

규칙: 하나의 뷰 파일은 하나의 책임. 조회 뷰 안에 생성 폼을 상시 노출하지 않는다(§8 학생 페이지 역전). 모달 안에서 또 모달을 열지 않는다.

## 6. 오버플로 제로 규칙

1. table은 반드시 TableWrap 안에. 날짜·금액 열은 `whitespace-nowrap`, 이름·메모 열은 `max-w-[NN] truncate` + `title` 속성.
2. flex 안의 텍스트 컨테이너는 `min-w-0` + `truncate` 세트로만.
3. 고정 열수 grid(`grid-cols-7` 등)는 캘린더 계열만 허용하되 부모에 `overflow-x-auto` + `min-w` 필수 (CounselCalendar 수리 대상).
4. 캘린더 칩 내부 텍스트는 기존 B-6 클립 방식(maxHeight 계산 + overflow-hidden) 준용 — 이미 검증됨.
5. 수치 검증: QA 하네스의 DOM 오버플로 검사(§감사에 사용한 스크립트)를 1280px·1024px 뷰포트로도 실행해 회귀 방지.

## 7. 색·토큰 규칙

- 인라인 `style={{ borderColor: 'var(--color-line)' }}` 류 전면 금지 → `border-line`, `border-line-muted`, `bg-canvas-subtle`, `text-danger` 등 **토큰에서 이미 생성되는 유틸리티**로 치환 (기능 변화 0, 50곳+).
- 시맨틱 톤은 tokens.ts `Tone` 6종 외 추가 금지. 직접 hex 금지.
- 상태 표현은 Badge(+StatusDot) 단일 경로.

**브랜드 컬러 — GitHub(Primer)/ERP 계열 유지 (2026-07-06 컨펌)**:

- 주 액션 `.btn-primary` = Primer 그린(`--color-success-emphasis` #1f883d) **유지**.
- 액센트/활성 상태 = Primer 블루(`--color-accent` #0969da) **유지**. 사이드바 활성·캘린더 "오늘"·선택 표식은 accent 계열로 통일.
- `--radius-md: 8px`로 상향(카드·버튼·인풋 일괄 반영). `--radius-lg: 12px` 유지.

---

## 8. UX 흐름 개선 (적극 리디자인 항목 — 4건 모두 **컨펌 완료** 2026-07-06)

| 화면 | 문제 | 개선 |
|---|---|---|
| **학생·부모** | 등록 폼이 최상단, 목록이 스크롤 아래로 밀림 | 목록 우선. 헤더 우측 "+ 학생 등록" → 접이식 패널(기본 접힘) |
| **대시보드** | 카드 5개 비대칭, 0건 카드가 공간 점유, StatCard 1개 고아 배치 | 0건 그룹은 한 줄 요약 스트립으로 축약, 대기>0 카드만 카드로. StatCard는 상단 지표 행(등록·학생·이번주 수업·미수금)으로 4개 채우거나 제거 |
| **캘린더** | 필터 카드가 상시 2행 점유, 부제가 단축키 설명서 | 필터바 1행 압축 + "필터" 토글(활성 필터 개수 배지). 단축키 안내는 ⓘ 팝오버로 이동, 부제는 기간·건수·시수만 |
| **강사 페이** | 급여수정이 window.prompt 2연타 | PromptModal(금액+사유 한 화면). 흐름 생성→승인→지급 상태 배지는 현행 유지 |
| **승인 센터** | 0건 섹션도 풀 카드 | EmptyState 한 줄 축약, 대기 있는 섹션이 위로 |
| **공통** | 하드코딩 "2026년 6월", 설정 메뉴 죽은 링크 | 현재 월 동적 표기, 설정 메뉴 숨김(준비 중) |

## 9. 문서화 체계

- 본 문서(`frontend/DESIGN.md`) = 단일 기준. 변경은 PR로.
- `components/ui/*` 각 파일 상단에 용도·금지사항 JSDoc 1블록.
- CONTRIBUTING.md에 "화면 추가 시 §2 배정표 갱신 필수" 항목 추가.
- QA: 디자인 변경 PR은 하네스 스크린샷(1440·1280) 첨부.

---

## 10. 구현 계획 · 진행 상태

- ✅ **Phase A — 기반** (2026-07-06, FE `619eeeb`): @theme 토큰(§2.1·§3·§7) + Pretendard + 공용 컴포넌트 6종(§5) + 일괄 치환. middleware /fonts 게이트 버그 수정 동반.
- ✅ **Phase B — 핵심 페이지** (2026-07-06, FE `8ff25cf`): §2.4 높이 규격·§5.5 view 분리 기준 신설 + 대시보드·캘린더(툴바 통합·ⓘ·스플릿 필터바 통일)·강사 페이(PromptModal·상태 무결성 수정)·학생(목록 우선)·출석부·승인 센터. HelpPopover 추가. QA 17샷 오버플로 0.
- ⬜ **Phase C — 잔여 페이지 + 회귀** (다음 스프린트, 체크리스트=docs/TODO.md 🎨 섹션 C-1~C-4): 상담·결제·지출·보고서·수업·관리자·인사이트 배정표 적용, 상태 백로그 3건, 1280/1024·세로 스캔, 문서 마감.

각 Phase 종료 시 변경점·근거·무결성 보고 후 다음 Phase 진행.
