# TACO Web (frontend)

Next.js(App Router) + Tailwind v4 기반 TACO ERP 웹. **독립 repo**로 운영하며, 추후 데스크탑(Electron/Tauri)으로 확장합니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
```

백엔드 API는 `next.config.ts`의 rewrites로 `/api/*` → `http://localhost:3001`로 프록시됩니다. 다른 주소면 `.env.local`에 `NEXT_PUBLIC_API_URL` 지정.

## 디자인 시스템

GitHub Primer 느낌의 모던 ERP, **밝은 테마** 우선. 토큰은 `app/globals.css`의 CSS 변수 + Tailwind v4 `@theme`로 노출됩니다.

- 색: `canvas / fg / line / accent / success / attention / danger / done` 시맨틱 토큰
- 컴포넌트 클래스: `.btn(.btn-primary/-danger/-invisible/-sm)`, `.card`, `.badge-*`, `.input`, `.table`, `.mono`
- 공용 React 컴포넌트: `components/ui/*`(Badge·StatCard·SectionCard·StatusDot·icons), `components/layout/*`(Sidebar·Topbar)

다크 테마는 `globals.css`의 토큰을 `@media (prefers-color-scheme: dark)` 또는 `[data-theme=dark]`로 재정의하면 확장됩니다.

- 차트: `components/ui/Chart`(chart.js 래퍼), 재사용 `MonthCalendar`, `Combobox`(라벨 추천)

## 구조 (feature 기반, 확장형)

```
app/                 # 라우트는 얇게 (각 page는 feature View 렌더만)
│  · / · /schedule · /counsel[/id] · /students · /sessions[/id][/feedback/sid]
│  · /payments[/new|/id] · /payouts · /expenses[/new|/id] · /admin[/courses|/events|/approvals]
components/
├─ ui/               # 프리미티브 + Chart·MonthCalendar·Combobox (+ index 배럴)
└─ layout/           # Sidebar·Topbar(역할 전환)
features/            # 도메인 단위 (확장 지점)
│  dashboard · schedule · counsel · students · sessions
│  payments · payouts · expenses · admin · system(BackendPanel)
lib/                 # api(axios) · store(zustand) · mock/seed · mock/integrity
│  payroll(시수×시급) · roles(RBAC) · format(결정적) · auth(jwt-decode)
types/               # @taco/contracts 재노출(단일 소스)
```

데이터 계층은 **Zustand 단일 스토어**(`lib/store`)가 in-memory mock DB 역할을 하며, `lib/mock/seed`로 초기화하고 `lib/mock/integrity`로 참조 무결성을 검사합니다.

## 타입 컨벤션

기본적으로 `type`을 사용합니다. `interface`는 선언 병합이나 클래스 implements 계약이 필요할 때만 쓰고, 사유를 주석으로 남깁니다. 도메인 타입은 `@taco/contracts`가 단일 소스이며 `@/types`로 재노출합니다.

## 자세한 개발 가이드

폴더 규칙·새 기능 추가 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md) 참고.
