'use client';
// [TBO-29D D3] 학생+보호자+수강을 **원자 등록 command**(POST /students/registrations) 하나로 전송 —
//  구 2연타(createStudent→createEnrollment) 폐지(중간 실패 시 부분 저장이 가능했다).
//  학생/학부모 webId 입력 제거: 학생·학부모는 백오피스 로그인 계정이 아니다(29A 계약 — users 행 없음).
//  보호자 전화가 기존 보호자와 같으면 서버가 기존 행에 연결(upsert-or-link) — 성공 메시지로 안내.
import { useState } from 'react';
import { Field } from '@/components/ui';
import { useRegisterStudent, useCourses } from '@/lib/queries';
import { COUNTRIES } from '@/lib/domain/tz'; // 국가(피드백 2026-07-02) — 해외 학생 시차 시간표 기준

type FormState = {
  name: string;
  englishName: string;
  grade: string;
  country: string; // ISO alpha-2 — 기본 KR(국내)
  phone: string;
  courseId: string;
  parentName: string;
  parentPhone: string;
  relation: string;
};

const empty: FormState = {
  name: '', englishName: '', grade: '', country: 'KR', phone: '', courseId: '',
  parentName: '', parentPhone: '', relation: '모',
};

export function StudentForm() {
  const register = useRegisterStudent();
  const { data: courses = [] } = useCourses();
  const [f, setF] = useState<FormState>(empty);
  const [err, setErr] = useState(''); // [C-1] alert 대체 — 인라인 검증 메시지
  const [ok, setOk] = useState('');
  const set = (p: Partial<FormState>) => setF((prev) => ({ ...prev, ...p }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    setErr(''); setOk('');
    register.mutate(
      {
        student: {
          name: f.name.trim(),
          englishName: f.englishName.trim() || undefined,
          grade: f.grade ? Number(f.grade) : undefined,
          country: f.country !== 'KR' ? f.country.split('-')[0] : undefined, // KR은 기본값 — 저장 생략(US-W→US)
          phone: f.phone.trim() || undefined,
        },
        guardian: f.parentName.trim()
          ? { name: f.parentName.trim(), phone: f.parentPhone.trim() || undefined, relation: f.relation }
          : undefined,
        courseId: f.courseId ? Number(f.courseId) : undefined,
      },
      {
        onSuccess: (result) => {
          setF(empty);
          setOk(
            result.guardian?.linkedExisting
              ? `등록 완료 — 기존 보호자 ${result.guardian.parent.name}님과 연결했습니다.`
              : '등록 완료',
          );
        },
        onError: (e) => {
          // [E0.6 L 2026-07-16] 서버 원문(class-validator 영문 배열 등) 노출 방지 — 한글 메시지만
          //  그대로 쓰고, 아니면 상태코드별 한글 안내. 원자 command라 부분 저장 없음은 항상 안내.
          const ax = e as { response?: { status?: number; data?: { message?: string | string[] } } };
          const raw = ax.response?.data?.message;
          const serverMsg = Array.isArray(raw) ? raw[0] : raw;
          const status = ax.response?.status;
          setErr(
            serverMsg && /[가-힣]/.test(serverMsg)
              ? serverMsg
              : status === 400 ? '입력값 형식이 올바르지 않습니다. 학년·연락처를 확인해 주세요. (부분 저장 없음)'
                : status === 409 ? '기존 학생·보호자 정보와 충돌합니다. 목록에서 중복 여부를 확인해 주세요.'
                  : status != null && status >= 500 ? '서버 오류로 등록하지 못했습니다. 잠시 후 다시 시도해 주세요. (부분 저장 없음)'
                    : '등록하지 못했습니다. 네트워크 연결을 확인해 주세요. (부분 저장 없음)',
          );
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-4">
      <Group title="학생 정보">
        <Field label="이름 *"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="김서연" /></Field>
        <Field label="영문명"><input className="input" value={f.englishName} onChange={(e) => set({ englishName: e.target.value })} placeholder="Sophia" /></Field>
        <Field label="학년"><input className="input" type="number" min={1} max={12} value={f.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="11" /></Field>
        <Field label="국가">
          <select className="input" value={f.country} onChange={(e) => set({ country: e.target.value })} title="해외 학생이면 국가 선택 — 캘린더에서 그 나라 시간 시간표 제공">
            {COUNTRIES.map((c) => (<option key={c.code} value={c.code}>{c.flag} {c.name}</option>))}
          </select>
        </Field>
        <Field label="연락처"><input className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="010-0000-0000" /></Field>
        <Field label="등록 코스 (선택)">
          <select className="input" value={f.courseId} onChange={(e) => set({ courseId: e.target.value })}>
            <option value="">— 미등록 —</option>
            {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
      </Group>

      <Group title="학부모 (선택 — 결제·연락 주체, 학생과 함께 원자 저장)">
        <Field label="학부모 이름"><input className="input" value={f.parentName} onChange={(e) => set({ parentName: e.target.value })} placeholder="김미경" /></Field>
        <Field label="관계">
          <select className="input" value={f.relation} onChange={(e) => set({ relation: e.target.value })}>
            <option value="모">모</option>
            <option value="부">부</option>
            <option value="보호자">보호자</option>
          </select>
        </Field>
        <Field label="학부모 연락처"><input className="input" value={f.parentPhone} onChange={(e) => set({ parentPhone: e.target.value })} placeholder="010-0000-0000 (같은 번호는 기존 보호자와 자동 연결)" /></Field>
      </Group>

      <div className="flex items-center justify-end gap-3">
        {err && <span className="text-caption text-danger">{err}</span>}
        {ok && <span className="text-caption text-success">{ok}</span>}
        <button type="submit" className="btn btn-primary" disabled={register.isPending}>
          {register.isPending ? '등록 중…' : '학생 등록'}
        </button>
      </div>
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption font-semibold text-fg-muted mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}
