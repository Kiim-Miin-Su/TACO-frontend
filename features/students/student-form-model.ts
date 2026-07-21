import type {
  CreateStudentInput,
  ParentLinkInput,
  Student,
  StudentInterest,
  StudentInterestInput,
  StudentStatus,
} from '@/types';

export type StudentProfileFormValue = {
  name: string;
  englishName: string;
  gender: '' | NonNullable<Student['gender']>;
  birthDate: string;
  grade: string;
  country: string;
  address: string;
  addressDetail: string;
  schoolName: string;
  phone: string;
  kakaoId: string;
  counselTopic: string;
  status: StudentStatus;
  memo: string;
};

export type InterestFormValue = {
  clientId: string;
  target: 'course' | 'custom';
  courseId: string;
  customLabel: string;
};

export type GuardianFormValue = {
  clientId: string;
  name: string;
  phone: string;
  relation: string;
  isPayer: boolean;
  isPrimary: boolean;
};

export type StudentFormErrors = Partial<Record<keyof StudentProfileFormValue | 'interests' | 'guardians', string>>;

let clientSequence = 0;
export function newClientId(prefix: 'interest' | 'guardian'): string {
  clientSequence += 1;
  return `${prefix}-${clientSequence}`;
}

export function emptyStudentProfile(): StudentProfileFormValue {
  return {
    name: '', englishName: '', gender: '', birthDate: '', grade: '', country: 'KR', address: '',
    addressDetail: '', schoolName: '', phone: '', kakaoId: '', counselTopic: '', status: 'new_inquiry', memo: '',
  };
}

export function studentProfileOf(student: Student): StudentProfileFormValue {
  return {
    name: student.name,
    englishName: student.englishName ?? '',
    gender: student.gender ?? '',
    birthDate: student.birthDate ?? '',
    grade: student.grade == null ? '' : String(student.grade),
    country: student.country ?? 'KR',
    address: student.address ?? '',
    addressDetail: student.addressDetail ?? '',
    schoolName: student.schoolName ?? '',
    phone: student.phone ?? '',
    kakaoId: student.kakaoId ?? '',
    counselTopic: student.counselTopic ?? '',
    status: student.status,
    memo: student.memo ?? '',
  };
}

export function initialInterests(): InterestFormValue[] {
  return [
    { clientId: 'interest-initial-1', target: 'course', courseId: '', customLabel: '' },
    { clientId: 'interest-initial-2', target: 'course', courseId: '', customLabel: '' },
  ];
}

export function interestFormsOf(interests: StudentInterest[]): InterestFormValue[] {
  return [...interests]
    .sort((a, b) => a.priority - b.priority)
    .map((interest) => ({
      clientId: `interest-${interest.id}`,
      target: interest.courseId != null ? 'course' : 'custom',
      courseId: interest.courseId == null ? '' : String(interest.courseId),
      customLabel: interest.customLabel ?? '',
    }));
}

export function validateStudentForm(profile: StudentProfileFormValue, interests: InterestFormValue[], guardians: GuardianFormValue[] = []): StudentFormErrors {
  const errors: StudentFormErrors = {};
  if (!profile.name.trim()) errors.name = '학생 이름을 입력해 주세요.';
  if (!profile.gender) errors.gender = '성별을 선택해 주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)) errors.birthDate = '생년월일을 선택해 주세요.';
  if (!profile.grade || Number(profile.grade) < 1 || Number(profile.grade) > 12) errors.grade = '학년은 1~12 사이여야 합니다.';
  if (!/^[A-Z]{2}$/.test(profile.country)) errors.country = '거주 국가는 ISO 2자리 국가 코드여야 합니다.';
  if (!profile.address.trim()) errors.address = '현 거주지를 입력해 주세요.';
  if (!profile.schoolName.trim()) errors.schoolName = '재학 학교를 입력해 주세요.';
  if (!profile.phone.trim()) errors.phone = '학생 연락처를 입력해 주세요.';
  if (profile.country !== 'KR' && !profile.kakaoId.trim()) errors.kakaoId = '해외 거주 학생은 카카오톡 ID가 필요합니다.';
  if (!profile.counselTopic.trim()) errors.counselTopic = '상담 주제를 입력해 주세요.';
  if (interests.length < 2) errors.interests = '희망 수업은 2개 이상이어야 합니다.';
  if (interests.some((item) => item.target === 'course' ? !item.courseId : !item.customLabel.trim())) {
    errors.interests = '각 희망 수업의 코스 또는 직접 입력명을 채워 주세요.';
  }
  const interestKeys = interests.map((item) => item.target === 'course' ? `course:${item.courseId}` : `custom:${item.customLabel.trim().toLowerCase()}`);
  if (interestKeys.some(Boolean) && new Set(interestKeys).size !== interestKeys.length) errors.interests = '중복된 희망 수업이 있습니다.';
  if (guardians.some((guardian) => !guardian.name.trim())) errors.guardians = '추가한 보호자의 이름을 입력해 주세요.';
  if (guardians.filter((guardian) => guardian.isPrimary).length > 1) errors.guardians = '주보호자는 한 명만 선택할 수 있습니다.';
  const guardianKeys = guardians.map((guardian) => `${guardian.name.trim().toLowerCase()}:${guardian.phone.replace(/\D/g, '')}`);
  if (guardianKeys.some(Boolean) && new Set(guardianKeys).size !== guardianKeys.length) errors.guardians = '중복된 보호자 입력이 있습니다.';
  return errors;
}

export function studentInputOf(profile: StudentProfileFormValue): CreateStudentInput {
  return {
    name: profile.name.trim(),
    englishName: profile.englishName.trim() || undefined,
    gender: profile.gender || undefined,
    birthDate: profile.birthDate,
    grade: Number(profile.grade),
    country: profile.country.trim(),
    residenceType: profile.country === 'KR' ? 'domestic' : 'overseas',
    address: profile.address.trim(),
    addressDetail: profile.addressDetail.trim() || undefined,
    schoolName: profile.schoolName.trim(),
    phone: profile.phone.trim(),
    kakaoId: profile.kakaoId.trim() || undefined,
    counselTopic: profile.counselTopic.trim(),
    status: profile.status,
    memo: profile.memo.trim() || undefined,
  };
}

export function interestInputsOf(interests: InterestFormValue[]): StudentInterestInput[] {
  return interests.map((interest, index) => ({
    ...(interest.target === 'course' ? { courseId: Number(interest.courseId) } : { customLabel: interest.customLabel.trim() }),
    priority: index + 1,
  }));
}

export function guardianInputsOf(guardians: GuardianFormValue[]): ParentLinkInput[] {
  const hasPrimary = guardians.some((guardian) => guardian.isPrimary);
  return guardians.map((guardian, index) => ({
    name: guardian.name.trim(),
    phone: guardian.phone.trim() || undefined,
    relation: guardian.relation.trim() || undefined,
    isPayer: guardian.isPayer,
    isPrimary: hasPrimary ? guardian.isPrimary : index === 0,
  }));
}

export function serverStudentErrors(error: unknown): { message: string; fields: StudentFormErrors } {
  const response = (error as { response?: { status?: number; data?: { message?: string | string[] } } }).response;
  const raw = response?.data?.message;
  const message = (Array.isArray(raw) ? raw.join(' ') : raw) ?? '';
  const fields: StudentFormErrors = {};
  const mappings: Array<[RegExp, keyof StudentFormErrors]> = [
    [/이름|name/i, 'name'], [/성별|gender/i, 'gender'], [/생년월일|birthDate/i, 'birthDate'], [/학년|grade/i, 'grade'],
    [/국가|country|거주 유형/i, 'country'], [/거주지|address/i, 'address'], [/학교|schoolName/i, 'schoolName'],
    [/연락처|phone/i, 'phone'], [/카카오|kakaoId/i, 'kakaoId'], [/상담 주제|counselTopic/i, 'counselTopic'],
    [/희망|interest|priority|course/i, 'interests'], [/보호자|guardian|primary/i, 'guardians'],
  ];
  for (const [pattern, field] of mappings) if (pattern.test(message)) fields[field] = message;
  const fallback = response?.status === 409
    ? '기존 정보와 충돌합니다. 중복 입력을 확인해 주세요.'
    : response?.status != null && response.status >= 500
      ? '서버 오류로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      : '입력값을 저장하지 못했습니다. 표시된 항목을 확인해 주세요.';
  return { message: /[가-힣]/.test(message) ? message : fallback, fields };
}
