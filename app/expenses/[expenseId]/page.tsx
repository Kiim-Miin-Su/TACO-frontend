import { ExpenseDetailView } from '@/features/expenses/ExpenseDetailView';
import { requirePageRouteId } from '@/lib/page-route-id';

export default async function Page({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const { expenseId } = await params;
  return <ExpenseDetailView expenseId={requirePageRouteId(expenseId)} />;
}
