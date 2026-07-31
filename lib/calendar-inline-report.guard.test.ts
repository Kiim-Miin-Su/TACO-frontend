// [TBO-80 80I / P-7] 캘린더 인라인 리포트 가드 — SessionDetailPanel이 세션 상세와
//  "같은 폼·같은 권한 규칙"을 재사용하는지 소스 레벨로 잠근다(이원화 회귀 방지).
//  이빨 실증: 80I 이전 SessionDetailPanel에는 아래 어느 패턴도 없어 5케이스 전부 실패한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '../features/calendar/SessionDetailPanel.tsx'), 'utf8');

describe('calendar inline report guard (TBO-80 80I / P-7)', () => {
  it('공용 SessionFeedbackForm을 import한다(자체 폼 사본 금지)', () => {
    expect(src).toMatch(/import \{ SessionFeedbackForm \} from ["']@\/features\/reports\/SessionFeedbackForm["']/);
    // 자체 textarea 폼을 새로 만들지 않았는지 — 폼 마크업은 SessionFeedbackForm 내부에만 존재해야 한다.
    expect(src).not.toMatch(/<textarea/);
  });

  it('선택 세션 row를 그대로 session prop으로 전달한다(ScheduleRow = ClassSession 확장)', () => {
    expect(src).toMatch(/<SessionFeedbackForm session=\{row\} student=\{student\} canEdit=\{canFeedback\} \/>/);
  });

  it('권한 규칙이 세션 상세와 동일하다(calendar.manage or 담당 강사 본인)', () => {
    expect(src).toMatch(/access\.can\(["']calendar\.manage["']\)/);
    expect(src).toMatch(/Number\(row\.instructorId\) === access\.instructorId/);
  });

  it('로스터는 세션 응답 studentIds(SSOT)에서만 파생한다 — 프론트 코호트 재계산 금지', () => {
    expect(src).toMatch(/\(row\.studentIds \?\? \[\]\)\.map\(Number\)/);
    // enrollment/active 필터로 코호트를 재계산하는 패턴이 이 파일에 재유입되면 안 된다(cohort SSOT 규약).
    expect(src).not.toMatch(/enrollments?\s*\.\s*filter/);
    expect(src).not.toMatch(/status\s*===\s*["']active["']/);
  });

  it('폼은 펼친 학생만 마운트한다(좁은 패널에서 N개 동시 마운트 방지)', () => {
    expect(src).toMatch(/\{open && \(/);
  });
});
