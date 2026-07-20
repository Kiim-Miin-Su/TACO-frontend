// [B6 C2 2026-07-16] 폼 검증 규칙 단일 소스 — 정규식·한도가 화면마다 복붙되며 강도가 갈라졌다
//  (출생연도 범위검사 유무, 비밀번호 byte/char 기준 불일치 — B6 문서 §3c). 여기 정의만 import해 쓴다.
//  FE 검증은 1차 방어이고 권위는 항상 서버 DTO — 각 항목 주석에 대응 서버 규칙을 명시한다.

/** 국내 전화 형식 — BE SignupDto·ChangeCredentialsDto @Matches와 동일(010-1234-5678). */
export const PHONE_KR_RE = /^\d{2,3}-\d{3,4}-\d{4}$/;
/** 국제 E.164(+국가코드) — 서버 libphonenumber 정규화가 권위(SENS 준비 §13.87). */
export const PHONE_INTL_RE = /^\+[1-9]\d{7,14}$/;
/** 인증 코드(이메일/SMS OTP) — BE profile-verifications confirm 규칙. */
export const OTP_CODE_RE = /^\d{4,10}$/;
/** 출생연도 — BE SignupDto @Min(1940)/@Max(2020) 채택(현실 범위·엄격측 통일).
 *  change-credentials DTO(1900~2100)보다 좁다 — FE가 더 엄격한 쪽은 안전. */
export const BIRTH_YEAR_MIN = 1940;
export const BIRTH_YEAR_MAX = 2020;
/** 비밀번호 길이 — BE MinLength(8)/MaxLength(72)(char). FE는 **byte 기준으로 통일**:
 *  bcrypt는 72바이트에서 절단되므로 한글 등 멀티바이트 비밀번호는 char 기준으론 통과해도
 *  실제로는 잘려 저장된다(reset-password가 char 기준이던 편차 정정 — B6 §3c). */
export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 72;
/** 요청 사유 공통(프로필 변경·수업 승인 요청) — BE @MinLength(5)/@MaxLength(500). */
export const REASON_MIN = 5;
export const REASON_MAX = 500;
/** 아이디(webId) — BE ChangeCredentialsDto @MinLength(3)/@MaxLength(50). */
export const WEB_ID_MIN = 3;
export const WEB_ID_MAX = 50;

export const isValidKrPhone = (value: string) => PHONE_KR_RE.test(value.trim());
/** 국내 형식 또는 국제 E.164(공백/하이픈 허용) — 프로필 변경 등 해외 번호 허용 경로. */
export const isValidPhoneAny = (value: string) =>
  PHONE_KR_RE.test(value.trim()) || PHONE_INTL_RE.test(value.replace(/[\s-]/g, ""));
export const isValidOtpCode = (value: string) => OTP_CODE_RE.test(value.trim());
export const isValidBirthYear = (value: string | number) => {
  const year = Number(String(value).trim());
  return Number.isInteger(year) && year >= BIRTH_YEAR_MIN && year <= BIRTH_YEAR_MAX;
};
// [TBO-31 C2 2026-07-16] 주민등록번호(RRN) — BE common/rrn-crypto.util.ts RRN_REGEX와 동일 규칙.
/** 앞 6자리(생년월일) + 성별자리 1~8(내국인 1-4·외국인 5-8) + 6자리, 하이픈 선택. */
export const RRN_RE = /^\d{6}-?[1-8]\d{6}$/;
const rrnDigits = (value: string) => value.trim().replace(/-/g, "");
/**
 * 형식 검증 — 정규식 + 앞 6자리의 MM(01-12)·DD(01-31) 타당성만 본다(BE validateRrnFormat 동일).
 * **체크섬 검증은 하지 않는다**: 2020-10 이후 발급분은 뒷자리가 임의번호라 검증식이 폐지됐다
 * (구 검증식을 적용하면 합법 신규 번호를 거부하는 오류가 된다).
 */
export const isValidRrn = (value: string): boolean => {
  if (!RRN_RE.test(value.trim())) return false;
  const digits = rrnDigits(value);
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
};
/** 표시용 마스킹 — 생년월일 6자리 + 성별 자리만 남긴다: '950101-1******'(BE maskRrn 동일). */
export const maskRrn = (value: string): string => {
  const digits = rrnDigits(value);
  return `${digits.slice(0, 6)}-${digits[6]}******`;
};
export const passwordByteLength = (value: string) => new TextEncoder().encode(value).length;
/** 통과 시 null, 실패 시 사용자 표시용 한글 메시지(모든 폼이 같은 문구를 쓰도록 여기서 생성). */
export const passwordLengthError = (value: string): string | null => {
  const bytes = passwordByteLength(value);
  if (bytes < PASSWORD_MIN_BYTES) return `비밀번호는 ${PASSWORD_MIN_BYTES}바이트 이상이어야 합니다.`;
  if (bytes > PASSWORD_MAX_BYTES) return `비밀번호는 ${PASSWORD_MAX_BYTES}바이트 이하여야 합니다.`;
  return null;
};
