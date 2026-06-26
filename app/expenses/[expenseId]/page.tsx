import { ExpenseDetailView } from '@/features/expenses/ExpenseDetailView';

export default async function Page({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const { expenseId } = await params;
  return <ExpenseDetailView expenseId={Number(expenseId)} />;
}
