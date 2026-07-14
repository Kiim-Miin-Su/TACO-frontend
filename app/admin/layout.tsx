import { AdminGuard } from "@/features/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
