import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

describe('[TBO-92] operations CRUD and empty-state wiring', () => {
  it('강사 CRUD UI는 admin.area, 금액 UI는 finance.access로 분리한다', () => {
    const list = read('features/admin/InstructorsView.tsx');
    const detail = read('features/admin/InstructorDetailView.tsx');
    const create = read('features/admin/instructors/InstructorCreateForm.tsx');

    for (const source of [list, detail, create]) expect(source).toContain("can('finance.access')");
    expect(list).toContain("can('admin.area')");
    expect(detail).toContain("can('admin.area')");
    expect(detail).toContain('useSudoAction');
    expect(create).toContain('useSudoAction');
    expect(detail).toContain("...(canManageFinance ? { defaultHourlyRate:");
    expect(create).toContain("...(canManageFinance ? { defaultHourlyRate:");
  });

  it('캘린더는 공용 강사 폼과 공용 EmptyState, resource 빈 상태 함수를 재사용한다', () => {
    const modal = read('features/calendar/ScheduleCreateModal.tsx');
    expect(modal).toContain('<InstructorCreateForm');
    expect(modal).toContain('<EmptyState');
    expect(modal).toContain('instructorScheduleRequestEmptyState');
    expect(modal).toContain('coursesForInstructor');
    expect(modal).toContain('access.can("admin.area")');
  });
});
