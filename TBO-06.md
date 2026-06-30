# Frontend — TBO-05 완료 / TBO-06 계획

작성일: 2026-06-30 (화) · 범위: Next.js(App Router). 상세 종합: `../docs/TODO.md`.

## ✅ TBO-05 완료 (페이 정산 연동 + 알림/대시보드)

- **`lib/api.ts`** — `reports`·`payouts` 클라이언트 + TBO-05 응답 타입(`MeasureResult`/`PayoutRow`/`SessionReport`).
- **`features/payouts/PayoutsView`** — mock → **실시간 백엔드** 전환(온/오프라인 감지). 강사·기간 선택 → 산정 미리보기 → 정산서 생성. 관리자 액션(승인/지급/급여수정/반려) + 역할 게이팅, `rejected`/`adjustedAmount` 표시.
- **`lib/tasks.ts`** — 역할별 "대기 중인 할 일" 단일 소스(`buildTasks`). 배지·대시보드 공유.
  - 관리자/매니저: 강사 페이 승인·지급, 학생 상담/등록 요청, 지출 승인.
  - 강사: 리포트 미작성, 오늘·다가오는 수업.
- **`components/layout/Topbar`** — 우측 상단 벨에 앱 알림식 **빨간 원 + 대기 수**, 클릭 시 항목 팝오버 → 이동.
- **`features/dashboard/DashboardView`** — 강사(리포트 미작성·오늘/다가오는 수업) / 매니저·관리자("할 일 · 처리 대기" 카드) To-do.
- **seed 보강** — 오늘·다가오는 수업, 리포트 미작성 세션, 미승인/미지급 정산서. 데모 검증: 관리자 4 · 강사 2 · 학생 0. **typecheck 0.**

## 🔜 TBO-06 (로그인 + 무결성·조인 검증)

- [ ] **로그인 세션** — 데모 역할 전환(`Topbar` select) → 실제 로그인 세션으로 대체(진행 중: 토큰 기반 로그아웃 노출). 사이드바/대시보드 신원도 토큰 기준.
- [ ] **신원 바인딩** — `lib/tasks.ts` `DEMO_INSTRUCTOR_ID`(고정 1) → **로그인 강사 user.id**. 본인 데이터만 잡히는지 검증.
- [ ] **단일 소스화** — 대시보드/알림 배지 데이터를 mock 스토어 → **백엔드 API**(payouts/reports/schedule/expenses)로 통합.
- [ ] **권한 UI 일치** — RBAC 가드(백엔드)와 화면 노출/액션 버튼 일치(권한 없는 역할 차단).

> 종합 계획: `../docs/TODO.md` TBO-06.
