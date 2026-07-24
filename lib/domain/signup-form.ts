import { isValidEmailFormat } from "@/lib/domain/profile";
import {
  WEB_ID_MIN,
  isValidKrPhone,
  isValidRrn,
  passwordLengthError,
} from "@/lib/validation";

export type SignupField =
  | "webId"
  | "name"
  | "email"
  | "password"
  | "passwordConfirm"
  | "phone"
  | "university"
  | "major"
  | "rrn"
  | "role";

export type SignupFormValues = Record<SignupField, string>;
export type SignupIssueCode =
  | "web_id_required"
  | "web_id_taken"
  | "name_required"
  | "email_invalid"
  | "email_unverified"
  | "password_invalid"
  | "password_mismatch"
  | "phone_required"
  | "phone_invalid"
  | "phone_unverified"
  | "university_required"
  | "rrn_invalid"
  | "role_invalid";

export type SignupIssue = {
  field: SignupField;
  code: SignupIssueCode;
  message: string;
};

const issue = (field: SignupField, code: SignupIssueCode, message: string): SignupIssue => ({
  field,
  code,
  message,
});

/** 화면 순서대로 첫 오류를 반환한다. 최종 권위 검증은 항상 backend SignupDto/DB command다.
 *  [TBO-57] phoneVerificationRequired = GET /auth/signup-config(BE required()와 단일 진실원) —
 *  true면 verified phoneChallengeId 없이는 제출 자체를 막는다(서버 400과 같은 판정). */
export function firstSignupIssue(input: {
  form: SignupFormValues;
  emailChallengeId: number | null;
  webIdVerdict: boolean | null;
  phoneVerificationRequired?: boolean;
  phoneChallengeId?: number | null;
}): SignupIssue | null {
  const { form, emailChallengeId, webIdVerdict, phoneVerificationRequired = false, phoneChallengeId = null } = input;
  if (form.webId.trim().length < WEB_ID_MIN) {
    return issue("webId", "web_id_required", `아이디는 ${WEB_ID_MIN}자 이상 입력해 주세요.`);
  }
  if (webIdVerdict === false) {
    return issue("webId", "web_id_taken", "이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.");
  }
  if (!form.name.trim()) return issue("name", "name_required", "이름을 입력해 주세요.");
  if (!isValidEmailFormat(form.email.trim().toLowerCase())) {
    return issue("email", "email_invalid", "이메일 형식이 올바르지 않습니다.");
  }
  if (emailChallengeId == null) {
    return issue(
      "email",
      "email_unverified",
      "이메일 인증을 완료해 주세요. 메일이 없으면 스팸함을 확인하고 기존 계정은 계정 찾기를 이용해 주세요.",
    );
  }
  const passwordError = passwordLengthError(form.password);
  if (passwordError) return issue("password", "password_invalid", passwordError);
  if (!form.passwordConfirm || form.password !== form.passwordConfirm) {
    return issue("passwordConfirm", "password_mismatch", "비밀번호 확인 값이 일치하지 않습니다.");
  }
  if (!form.phone.trim()) return issue("phone", "phone_required", "전화번호를 입력해 주세요.");
  if (!isValidKrPhone(form.phone)) {
    return issue("phone", "phone_invalid", "전화번호는 010-1234-5678 형식으로 입력해 주세요.");
  }
  if (phoneVerificationRequired && phoneChallengeId == null) {
    return issue("phone", "phone_unverified", "휴대전화 인증을 완료해 주세요. 인증 문자가 오지 않으면 번호 확인 후 재전송해 주세요.");
  }
  if (!form.university.trim()) {
    return issue("university", "university_required", "대학교(출신교)를 입력해 주세요.");
  }
  if (!isValidRrn(form.rrn)) {
    return issue("rrn", "rrn_invalid", "주민등록번호 형식이 올바르지 않습니다(예: 950101-1234567).");
  }
  if (!["instructor", "manager", "admin"].includes(form.role)) {
    return issue("role", "role_invalid", "신청 역할을 다시 선택해 주세요.");
  }
  return null;
}

/** 서버 메시지는 사용자 안내에만 쓰고, 포커스 대상만 안전한 필드 집합으로 축소한다. */
export function signupFieldForApiMessage(message: string): SignupField | null {
  if (/(이메일|email|challenge|인증)/i.test(message)) return "email";
  if (/(아이디|web.?id)/i.test(message)) return "webId";
  if (/(비밀번호|password)/i.test(message)) return "password";
  if (/(전화|연락처|phone)/i.test(message)) return "phone";
  if (/(주민|rrn)/i.test(message)) return "rrn";
  if (/(대학교|출신교|university)/i.test(message)) return "university";
  if (/(전공|major)/i.test(message)) return "major";
  if (/(이름|name)/i.test(message)) return "name";
  if (/(역할|role)/i.test(message)) return "role";
  return null;
}
