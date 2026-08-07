import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rosterStudentIds, sessionEndMs, type ReportSlice } from './reports';
import type { ClassSession, Enrollment } from '@/types';

// [SSOT 감사 2026-08-07] "리포트 미작성" 모집단 = 서버 worklist 단일 진실원(86G2).
//  종전 클라 재계산 6종(missingReportStudentIds·sessionNeedsReport·pendingReport*)은 소비처 0으로
//  삭제됐다 — 이 스펙은 잔존 유틸(roster·종료시각)만 검증하고, 재계산 함수 부활을 가드한다.

const ses = (p: Partial<ClassSession>): ClassSession => ({
  id: 1, courseId: 10, instructorId: 1, sessionDate: '2026-06-30', startTime: '16:00',
  durationMinutes: 90, status: 'held', ...p,
} as ClassSession);
const enr = (p: Partial<Enrollment>): Enrollment => ({ id: 1, studentId: 1, courseId: 10, status: 'active', enrolledAt: '2026-06-01', ...p } as Enrollment);

describe('rosterStudentIds — 리포트 대상 수강생(contracts 참여자 규칙 래퍼)', () => {
  it('활성 수강만 포함 — 취소 수강 제외(백엔드 코호트와 동일 규칙)', () => {
    const s: Pick<ReportSlice, 'enrollments'> = {
      enrollments: [enr({ id: 1, studentId: 1 }), enr({ id: 2, studentId: 4, status: 'canceled' })],
    };
    expect(rosterStudentIds(s, ses({}))).toEqual([1]);
  });

  it('명시 세션 코호트가 있으면 그 목록이 우선 — 같은 코스 다른 활성 수강생 제외', () => {
    const s: Pick<ReportSlice, 'enrollments'> = {
      enrollments: [enr({ id: 1, studentId: 1 }), enr({ id: 2, studentId: 4 })],
    };
    expect(rosterStudentIds(s, ses({ studentIds: [4] }))).toEqual([4]);
  });
});

describe('sessionEndMs — 실제 종료 시각 파생(lib/makeup 공유 규칙)', () => {
  it('endTime 없으면 startTime + durationMinutes로 계산한다', () => {
    expect(sessionEndMs(ses({ sessionDate: '2026-06-30', startTime: '16:00', durationMinutes: 90 })))
      .toBe(Date.parse('2026-06-30T17:30:00'));
  });

  it('startTime 없으면 종료 판정 보류(Infinity — 미포함 처리)', () => {
    expect(sessionEndMs(ses({ startTime: undefined as never }))).toBe(Number.POSITIVE_INFINITY);
  });

  it('endTime이 있으면 그대로 사용한다', () => {
    expect(sessionEndMs(ses({ endTime: '18:00' }))).toBe(Date.parse('2026-06-30T18:00:00'));
  });
});

describe('가드 — 클라 미작성 재계산 부활 금지', () => {
  it('lib/reports.ts에 pending* 재계산 함수가 다시 생기지 않는다(서버 worklist가 단일 진실원)', () => {
    const src = readFileSync(resolve(__dirname, 'reports.ts'), 'utf8');
    for (const banned of ['missingReportStudentIds', 'sessionNeedsReport', 'pendingReportSessions', 'pendingReportCount', 'pendingReportItemCount', 'pendingReportSummary']) {
      expect(src.includes(`function ${banned}`)).toBe(false);
    }
  });
});
