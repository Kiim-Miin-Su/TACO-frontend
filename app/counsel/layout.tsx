import { ManagementGuard } from '@/features/auth/ManagementGuard';

export default function CounselLayout({ children }: { children: React.ReactNode }) {
  return <ManagementGuard featureLabel="상담" capability="counsel.manage">{children}</ManagementGuard>;
}
