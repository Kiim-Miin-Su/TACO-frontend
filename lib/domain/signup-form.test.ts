import { describe, expect, it } from "vitest";
import {
  firstSignupIssue,
  signupFieldForApiMessage,
  type SignupFormValues,
} from "./signup-form";

const validForm: SignupFormValues = {
  webId: "new_staff",
  name: "신규 강사",
  email: "new@example.com",
  password: "password123",
  passwordConfirm: "password123",
  phone: "010-1234-5678",
  university: "서울대학교",
  major: "교육학",
  rrn: "950101-1234567",
  role: "instructor",
};

describe("회원가입 폼 첫 오류", () => {
  it("화면 순서의 첫 오류와 포커스 필드를 반환한다", () => {
    expect(firstSignupIssue({ form: { ...validForm, webId: "ab", name: "" }, emailChallengeId: null, webIdVerdict: null }))
      .toMatchObject({ field: "webId", code: "web_id_required" });
  });

  it("메일 형식 다음에 인증 완료 여부를 검사한다", () => {
    expect(firstSignupIssue({ form: { ...validForm, email: "wrong" }, emailChallengeId: null, webIdVerdict: true }))
      .toMatchObject({ field: "email", code: "email_invalid" });
    expect(firstSignupIssue({ form: validForm, emailChallengeId: null, webIdVerdict: true }))
      .toMatchObject({ field: "email", code: "email_unverified" });
  });

  it("전화·RRN 규칙을 공용 validation 단일 소스와 동일하게 적용한다", () => {
    expect(firstSignupIssue({ form: { ...validForm, phone: "01012345678" }, emailChallengeId: 7, webIdVerdict: true }))
      .toMatchObject({ field: "phone", code: "phone_invalid" });
    expect(firstSignupIssue({ form: { ...validForm, rrn: "950132-1234567" }, emailChallengeId: 7, webIdVerdict: true }))
      .toMatchObject({ field: "rrn", code: "rrn_invalid" });
  });

  it("모든 1차 검증이 통과하면 서버 command로 진행한다", () => {
    expect(firstSignupIssue({ form: validForm, emailChallengeId: 7, webIdVerdict: true })).toBeNull();
  });

  // [TBO-57] 휴대전화 인증 게이트 — signup-config(BE required()와 단일 진실원)가 true면
  //  verified phoneChallengeId 없이는 제출 자체가 막힌다(서버 400과 같은 판정).
  it("phoneVerificationRequired=true면 휴대전화 인증 완료 전 제출을 차단한다", () => {
    expect(firstSignupIssue({
      form: validForm, emailChallengeId: 7, webIdVerdict: true,
      phoneVerificationRequired: true, phoneChallengeId: null,
    })).toMatchObject({ field: "phone", code: "phone_unverified" });
    expect(firstSignupIssue({
      form: validForm, emailChallengeId: 7, webIdVerdict: true,
      phoneVerificationRequired: true, phoneChallengeId: 11,
    })).toBeNull();
    // 비필수 환경(SENS 미설정)은 기존 규칙 그대로 — 인증 없이 제출 가능
    expect(firstSignupIssue({
      form: validForm, emailChallengeId: 7, webIdVerdict: true,
      phoneVerificationRequired: false, phoneChallengeId: null,
    })).toBeNull();
  });

  it("휴대전화 형식 오류가 인증 게이트보다 먼저다(형식 → 인증 순서)", () => {
    expect(firstSignupIssue({
      form: { ...validForm, phone: "01012345678" }, emailChallengeId: 7, webIdVerdict: true,
      phoneVerificationRequired: true, phoneChallengeId: null,
    })).toMatchObject({ field: "phone", code: "phone_invalid" });
  });
});

describe("가입 API 오류 포커스 매핑", () => {
  it("서버 문구를 필드 화이트리스트로만 매핑한다", () => {
    expect(signupFieldForApiMessage("이미 사용 중인 webId입니다.")).toBe("webId");
    expect(signupFieldForApiMessage("가입 이메일의 인증이 필요합니다.")).toBe("email");
    expect(signupFieldForApiMessage("알 수 없는 서버 오류")).toBeNull();
  });
});
