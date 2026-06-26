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

## 구조 (feature 기반, 확장형)

```
app/                 # 라우트는 얇게 유지
├─ layout.tsx        #   사이드바 + 탑바 셸
├─ page.tsx          #   → features/dashboard 렌더만
└─ globals.css       #   디자인 토큰 + 컴포넌트 클래스
components/
├─ ui/               # 프리미티브: Badge·StatCard·SectionCard·StatusDot·icons (+ index 배럴)
└─ layout/           # Sidebar·Topbar
features/            # 화면/도메인 단위 (확장 지점)
└─ dashboard/        #   DashboardView + data
lib/                 # api 클라이언트, format, auth(jwt-decode)
types/               # 도메인 타입 (백엔드와 1:1)
```

## 타입 컨벤션

기본적으로 `type`을 사용합니다. `interface`는 선언 병합이나 클래스 implements 계약이 필요할 때만 쓰고, 해당 위치에 사유를 주석으로 남깁니다. (현재 코드는 전부 `type`)
