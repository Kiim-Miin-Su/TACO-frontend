import type { SessionReportView } from '@kms545487/contracts';

const authoredValue = (value: string | undefined) => value?.trim() || '미작성';

/**
 * 학부모 전달용 리포트 한 묶음. 조인 헤더와 작성 본문을 복제 저장하지 않고 서버 읽기 모델에서 투영한다.
 */
export function formatSessionReportBundle(report: SessionReportView): string {
  const { context } = report;
  const grade = context.student.grade == null ? '학년 미입력' : `G${context.student.grade}`;
  const subject = context.subject?.name ?? context.course.name;
  const time = context.session.startTime
    ? `${context.session.startTime}${context.session.endTime ? `-${context.session.endTime}` : ''}`
    : '시간 미입력';

  return [
    `학생/학년: ${context.student.name} / ${grade}`,
    `수업일자 / 과목 / 시간: ${context.session.sessionDate} / ${subject} / ${time}`,
    '',
    '수업 내용',
    authoredValue(report.content),
    '',
    '진도 페이지',
    authoredValue(report.progressPage),
    '',
    '숙제',
    authoredValue(report.homework),
  ].join('\n');
}
