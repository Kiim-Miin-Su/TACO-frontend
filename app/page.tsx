// 라우트는 얇게 — 화면 구현은 features/로 분리.
import { DashboardView } from '@/features/dashboard/DashboardView';

export default function Page() {
  return <DashboardView />;
}
