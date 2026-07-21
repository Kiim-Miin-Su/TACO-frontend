import { describe, expect, it } from 'vitest';
import {
  guardianInputsOf,
  interestInputsOf,
  studentInputOf,
  validateStudentForm,
  type GuardianFormValue,
  type InterestFormValue,
  type StudentProfileFormValue,
} from '@/features/students/student-form-model';

const profile: StudentProfileFormValue = {
  name: '고은성', englishName: '', gender: 'male', birthDate: '2012-07-16', grade: '8', country: 'KR',
  address: '서울시 강남구', addressDetail: '', schoolName: 'TACO School', phone: '010-1111-2222', kakaoId: '',
  counselTopic: 'Writing 상담', status: 'new_inquiry', memo: '',
};
const interests: InterestFormValue[] = [
  { clientId: 'a', target: 'course', courseId: '10', customLabel: '' },
  { clientId: 'b', target: 'custom', courseId: '', customLabel: 'Creative Writing' },
];

describe('student aggregate form SSOT', () => {
  it('모든 필수 프로필과 관심 우선순위를 DB contract payload로 변환한다', () => {
    expect(validateStudentForm(profile, interests)).toEqual({});
    expect(studentInputOf(profile)).toMatchObject({ name: '고은성', gender: 'male', birthDate: '2012-07-16', grade: 8, country: 'KR', address: '서울시 강남구', schoolName: 'TACO School', phone: '010-1111-2222', counselTopic: 'Writing 상담' });
    expect(interestInputsOf(interests)).toEqual([{ courseId: 10, priority: 1 }, { customLabel: 'Creative Writing', priority: 2 }]);
  });

  it('해외 Kakao, 희망수업 최소 2개와 중복, 보호자 주대표 불변을 차단한다', () => {
    const guardians: GuardianFormValue[] = [
      { clientId: 'g1', name: '보호자1', phone: '010-1', relation: '모', isPayer: true, isPrimary: true },
      { clientId: 'g2', name: '보호자2', phone: '010-2', relation: '부', isPayer: false, isPrimary: true },
    ];
    const errors = validateStudentForm({ ...profile, country: 'US', kakaoId: '' }, [interests[0]], guardians);
    expect(errors).toMatchObject({ kakaoId: expect.any(String), interests: expect.any(String), guardians: expect.any(String) });
    expect(validateStudentForm(profile, [interests[0], { ...interests[0], clientId: 'duplicate' }]).interests).toContain('중복');
  });

  it('주보호자 미선택 시 첫 행만 대표로 정규화하고 stable client id는 payload에 저장하지 않는다', () => {
    const guardians: GuardianFormValue[] = [
      { clientId: 'g1', name: '보호자1', phone: '', relation: '모', isPayer: true, isPrimary: false },
      { clientId: 'g2', name: '보호자2', phone: '', relation: '부', isPayer: false, isPrimary: false },
    ];
    expect(guardianInputsOf(guardians)).toEqual([
      { name: '보호자1', relation: '모', isPayer: true, isPrimary: true },
      { name: '보호자2', relation: '부', isPayer: false, isPrimary: false },
    ]);
  });
});
