// [TBO-89 owner 지시 2026-08-07] 리포트 표면 계약 가드.
//  ① 작성 폼 = 단일 텍스트 박스(진도/숙제 별도 input 금지 — 본문 합성 compose가 단일 규칙)
//  ② "작성 필요만" 토글 제거 — 미작성이 기본 리스트(배지와 같은 서버 worklist 모집단)
//  ③ 리스트 클릭 = 공용 ModalShell + 세션 상세 페이지 링크, 모달에 강사·학생 출결 포함
//  ④ 스케줄 추가 상태 선택지에 "완료"(과거 완료 이관 command 라우팅 — held 직접 주입은 계속 금지)
//  종전 구조(3분할 input·needOnly 토글·인라인 카드·별도 체크박스)로 되돌리면 실패한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

describe('[TBO-89] 리포트 표면 계약', () => {
  it('작성 폼은 단일 텍스트 박스 — 진도/숙제 별도 input 없음, 본문 합성은 composeReportText 단일 규칙', () => {
    const form = read('features/reports/SessionFeedbackForm.tsx');
    expect(form).toContain('composeReportText');
    expect(form).toContain('<ReportContentTextarea'); // [89b] 공용 컴포넌트 소비
    expect(form).not.toContain('placeholder="진도 페이지"');
    expect(form).not.toContain('placeholder="숙제 (다음 수업 전까지)"');
    // 저장 시 레거시 컬럼은 비운다(이중 표현 금지 — BE가 '' → null 정규화)
    expect(form).toContain("progressPage: ''");
    // 템플릿 행 잘림 수정 — 좁은 패널 래핑
    expect(form).toContain('flex flex-wrap items-center gap-2 mb-2');
  });

  // [TBO-89b owner 지시] 템플릿 편집 모달도 같은 단일 박스 컴포넌트 + 범위 통합.
  it('템플릿 모달 = 같은 단일 박스 컴포넌트 재사용, 적용 범위는 "전체 강사에게 적용" 단일 레버', () => {
    const modal = read('features/reports/ReportTemplateEditorModal.tsx');
    expect(modal).toContain('<ReportContentTextarea'); // 작성 폼과 같은 컴포넌트
    expect(modal).toContain('composeReportText'); // 레거시 분리 필드는 열 때 본문 합성
    expect(modal).not.toContain('진도 페이지'); // 별도 필드 부활 금지
    expect(modal).not.toMatch(/label[^\n]*숙제/); // 별도 필드 부활 금지
    expect(modal).toContain('전체 강사에게 적용');
    expect(modal).not.toContain('전체 강제 적용'); // 별도 강제 체크 제거(전역=강제 단일 레버)
    expect(modal).toContain('isEnforced: canManageScopes && applyAll');
    // 공용 컴포넌트가 기본 양식 placeholder의 단일 소유자다
    const shared = read('features/reports/ReportContentTextarea.tsx');
    expect(shared).toContain('DEFAULT_REPORT_SCAFFOLD');
  });

  it('작성 필요가 기본 리스트 — needOnly 토글은 두 표면 모두에서 제거됐다', () => {
    for (const path of ['features/reports/ReportWriteView.tsx', 'features/reports/ReportsCalendarView.tsx']) {
      const source = read(path);
      expect(source).not.toContain('needOnly'); // 토글 상태 자체가 없다
      expect(source).not.toContain("'작성 필요만'"); // 토글 버튼 라벨(JSX 문자열) 금지 — 주석 서술은 허용
      expect(source).toContain('worklist'); // 모집단 = 서버 worklist 단일 진실원
    }
  });

  it('리스트 클릭 = 공용 모달(강사·학생 출결 포함) + 세션 상세 페이지 링크', () => {
    const view = read('features/reports/ReportsCalendarView.tsx');
    expect(view).toContain('<ModalShell');
    expect(view).toContain('internalRoute.session(session.id)');
    expect(view).toContain('상세 페이지');
    expect(view).toContain('INSTRUCTOR_ATT_OPTIONS'); // 강사 출결 배지(공용 어휘 재사용)
    expect(view).toContain('attendance.find'); // 학생 출결
  });

  it('스케줄 추가 상태 선택지에 완료 — 전용 이관 command로만 라우팅(held 직접 주입 금지 유지)', () => {
    const modal = read('features/calendar/ScheduleCreateModal.tsx');
    expect(modal).toContain('completed_import');
    expect(modal).toContain('setHistoricalImport(true)');
    expect(modal).toContain('historicalCompletedInput'); // 86D 전용 계약 유지
    // 별도 체크박스 UI로 회귀 금지 — 상태 선택지가 단일 진입점
    expect(modal).not.toContain('checked={historicalImport}');
    const lantiv = read('lib/domain/lantiv.ts');
    expect(lantiv).not.toMatch(/MANUAL_SESSION_STATUSES[^\n]*held/);
  });
});
