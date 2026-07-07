// [TBO-20 20-0] 공용 세션 피드백(보고서) 작성 폼 — (session,student) 1건 단일.
//  단일 소스: 읽기=useReports/useReportTemplates, 쓰기=useCreateReport/useSubmitReport(백엔드가 session×student 단일화).
//  기존 ReportWriteView의 StudentReportRow·FeedbackFormView의 폼이 이원화 → 하나로 통합.
//  재사용처: ReportWriteView(인라인 목록)·FeedbackFormView(전용 페이지)·세션 상세 허브(20-3).
'use client';
import { useState } from 'react';
import { Badge, PromptModal, type Tone } from '@/components/ui';
import { useReports, useReportTemplates, useCreateReportTemplate, useCreateReport, useSubmitReport } from '@/lib/queries';
import type { ClassSession, ReportStatus, Student } from '@/types';

const reportTone: Record<ReportStatus, Tone> = { draft: 'neutral', submitted: 'accent', sent: 'success' };
const reportLabel: Record<ReportStatus, string> = { draft: '작성중', submitted: '작성완료', sent: '발송됨' };

/**
 * 세션×학생 피드백 작성 셀. 페이지 이동 없이 저장/제출.
 * @param canEdit 권한 가드(강사 본인/매니저). false면 읽기 전용(20-1 정합).
 */
export function SessionFeedbackForm({ session, student, canEdit = true }: { session: ClassSession; student: Student; canEdit?: boolean }) {
  const { data: sessionReports = [] } = useReports();
  // 템플릿은 DB 컬렉션(report_templates) — 강사 공용 자산(브라우저 휘발 제거).
  const { data: templates = [] } = useReportTemplates();
  const createTemplate = useCreateReportTemplate();
  const createReport = useCreateReport();
  const submitReport = useSubmitReport();
  const report = sessionReports.find((r) => r.sessionId === session.id && r.studentId === student.id);
  const [content, setContent] = useState(report?.content ?? '');
  const [homework, setHomework] = useState(report?.homework ?? '');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const status: ReportStatus = report?.status ?? 'draft';

  const applyTemplate = (id: number) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setContent((c) => (c.trim() ? c + '\n' + t.content : t.content));
    if (t.homework) setHomework((h) => h || t.homework!);
  };
  const [templateOpen, setTemplateOpen] = useState(false);
  const saveTemplate = (name: string) => {
    setTemplateOpen(false);
    if (name.trim() && content.trim()) createTemplate.mutate({ name: name.trim(), content, homework: homework || undefined });
  };

  const save = (submit: boolean) => {
    // 기존 보고서가 있으면 제출(submit by id). 없으면 신규 생성(create). 백엔드가 (session,student) 단일화.
    if (report) {
      if (submit && report.approvalStatus !== 'submitted' && report.approvalStatus !== 'approved') {
        submitReport.mutate(report.id);
      }
    } else {
      createReport.mutate({
        sessionId: session.id,
        studentId: student.id,
        instructorId: session.instructorId,
        content,
        homework: homework || undefined,
        status: submit ? 'submitted' : 'draft',
      });
    }
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium">{student.name}</span>
        {student.englishName && <span className="text-caption text-fg-subtle">{student.englishName}</span>}
        <Badge tone={reportTone[status]}>{reportLabel[status]}</Badge>
        {report?.approvalStatus === 'approved' && <Badge tone="success">승인됨 · 시수 반영</Badge>}
        {report?.approvalStatus === 'rejected' && <Badge tone="danger">반려</Badge>}
        {savedAt && <span className="text-micro text-fg-subtle ml-auto">저장됨 {savedAt}</span>}
      </div>
      {report?.approvalStatus === 'rejected' && report.rejectedReason && (
        <div className="mb-2 text-caption text-danger">반려 사유: {report.rejectedReason}</div>
      )}
      {!canEdit ? (
        // 읽기 전용(권한 없음) — 저장된 내용만 표시.
        <div className="space-y-1.5 text-body">
          <p className="whitespace-pre-wrap">{report?.content ? report.content : <span className="text-fg-subtle">작성된 피드백 없음</span>}</p>
          {report?.homework && <p className="text-caption text-fg-muted">숙제: {report.homework}</p>}
        </div>
      ) : (
        <>
          {/* 템플릿 적용/저장 */}
          <div className="flex items-center gap-2 mb-2">
            <select className="input h-8 w-44 text-caption" value="" onChange={(e) => e.target.value && applyTemplate(Number(e.target.value))}>
              <option value="">템플릿 적용…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" className="btn btn-sm" onClick={() => setTemplateOpen(true)} disabled={!content.trim()}>현재 내용을 템플릿으로</button>
          </div>
          <textarea
            className="input h-24 py-2 leading-relaxed"
            placeholder="오늘 수업 내용·태도·성취 (학부모 발송용)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <input
            className="input mt-2"
            placeholder="숙제 (다음 수업 전까지)"
            value={homework}
            onChange={(e) => setHomework(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button className="btn btn-sm" onClick={() => save(false)}>임시 저장</button>
            <button className="btn btn-sm btn-primary" disabled={!content.trim()} onClick={() => save(true)}>제출</button>
          </div>
          {templateOpen && (
            <PromptModal
              title="템플릿으로 저장"
              fields={[{ name: 'name', label: '템플릿 이름', required: true, placeholder: '예: 정규수업 기본' }]}
              submitLabel="저장"
              onClose={() => setTemplateOpen(false)}
              onSubmit={(v) => saveTemplate(v.name)}
            />
          )}
        </>
      )}
    </div>
  );
}
