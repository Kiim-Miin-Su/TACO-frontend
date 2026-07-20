// [B6 C2 2026-07-16] 검증 규칙 단일 소스 회귀 — 화면 복붙 시절의 강도 편차(출생연도 범위검사 유무,
//  비밀번호 byte/char 기준)가 되살아나지 않도록 규칙 자체를 고정한다.
import { describe, expect, it } from "vitest";
import {
  BIRTH_YEAR_MAX,
  BIRTH_YEAR_MIN,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_BYTES,
  isValidBirthYear,
  isValidKrPhone,
  isValidOtpCode,
  isValidPhoneAny,
  isValidRrn,
  maskRrn,
  passwordByteLength,
  passwordLengthError,
} from "./validation";

describe("전화번호", () => {
  it("국내 형식 010-1234-5678 통과, 하이픈 없음·자리 오류 거부", () => {
    expect(isValidKrPhone("010-1234-5678")).toBe(true);
    expect(isValidKrPhone("02-123-4567")).toBe(true);
    expect(isValidKrPhone("01012345678")).toBe(false);
    expect(isValidKrPhone("010-12-5678")).toBe(false);
  });
  it("국제 E.164는 isValidPhoneAny만 허용(공백/하이픈 허용) — KR 전용 경로와 분리", () => {
    expect(isValidPhoneAny("+1 415-555-0100")).toBe(true);
    expect(isValidKrPhone("+14155550100")).toBe(false);
    expect(isValidPhoneAny("+0123456789")).toBe(false); // 선행 0 국가코드 없음
  });
});

describe("OTP 코드", () => {
  it("4~10자리 숫자만(공백 trim)", () => {
    expect(isValidOtpCode(" 123456 ")).toBe(true);
    expect(isValidOtpCode("123")).toBe(false);
    expect(isValidOtpCode("12345678901")).toBe(false);
    expect(isValidOtpCode("12a456")).toBe(false);
  });
});

describe("출생연도", () => {
  it(`${BIRTH_YEAR_MIN}~${BIRTH_YEAR_MAX} 범위 정수만 — 범위검사 없던 가입 폼 편차 정정 고정`, () => {
    expect(isValidBirthYear("1998")).toBe(true);
    expect(isValidBirthYear(BIRTH_YEAR_MIN)).toBe(true);
    expect(isValidBirthYear(BIRTH_YEAR_MAX)).toBe(true);
    expect(isValidBirthYear("1939")).toBe(false);
    expect(isValidBirthYear("2021")).toBe(false);
    expect(isValidBirthYear("19x8")).toBe(false);
  });
});

// [TBO-31 C2 2026-07-16] 주민등록번호 — BE rrn-crypto.util(RRN_REGEX·validateRrnFormat)과 동일 규칙 고정.
describe("주민등록번호(RRN)", () => {
  it("형식 통과 — 하이픈 유무 모두, 내국인(1-4)·외국인(5-8) 성별자리", () => {
    expect(isValidRrn("950101-1234567")).toBe(true);
    expect(isValidRrn("9501011234567")).toBe(true);
    expect(isValidRrn(" 950101-1234567 ")).toBe(true); // trim
    expect(isValidRrn("001231-4234567")).toBe(true); // 2000년대(3,4)
    expect(isValidRrn("950101-8234567")).toBe(true); // 외국인(5-8)
  });
  it("성별자리 0·9 거부(1~8만)", () => {
    expect(isValidRrn("950101-0234567")).toBe(false);
    expect(isValidRrn("950101-9234567")).toBe(false);
  });
  it("자릿수 오류·숫자 외 문자 거부", () => {
    expect(isValidRrn("95010-11234567")).toBe(false);
    expect(isValidRrn("950101-123456")).toBe(false);
    expect(isValidRrn("950101-12345678")).toBe(false);
    expect(isValidRrn("95O101-1234567")).toBe(false);
  });
  it("MM 01-12·DD 01-31 경계 — 00·13월, 00·32일 거부(경계값 통과)", () => {
    expect(isValidRrn("950001-1234567")).toBe(false); // MM 00
    expect(isValidRrn("951301-1234567")).toBe(false); // MM 13
    expect(isValidRrn("950100-1234567")).toBe(false); // DD 00
    expect(isValidRrn("950132-1234567")).toBe(false); // DD 32
    expect(isValidRrn("950131-1234567")).toBe(true); // DD 31 경계
    expect(isValidRrn("951201-1234567")).toBe(true); // MM 12 경계
  });
  it("체크섬 검증은 하지 않는다 — 2020-10 이후 임의번호 발급분 수용(검증식 폐지)", () => {
    // 구 검증식 기준 체크섬이 틀린 번호도 형식이 맞으면 통과해야 한다.
    expect(isValidRrn("950101-1000000")).toBe(true);
    expect(isValidRrn("950101-1999999")).toBe(true);
  });
  it("maskRrn — 생년월일+성별자리만 노출(950101-1******), 하이픈 없어도 동일", () => {
    expect(maskRrn("950101-1234567")).toBe("950101-1******");
    expect(maskRrn("9501011234567")).toBe("950101-1******");
  });
});

describe("비밀번호 길이 — byte 기준(bcrypt 72B 절단 방지)", () => {
  it("한글은 3바이트 — char 기준이면 통과할 25자 한글이 byte 기준에선 초과", () => {
    const korean25 = "비".repeat(25); // 75 bytes > 72
    expect(passwordByteLength(korean25)).toBe(75);
    expect(passwordLengthError(korean25)).toContain(`${PASSWORD_MAX_BYTES}바이트`);
  });
  it("경계: 8바이트 미만 거부, 8~72바이트 통과", () => {
    expect(passwordLengthError("abcdefg")).toContain(`${PASSWORD_MIN_BYTES}바이트`);
    expect(passwordLengthError("abcdefgh")).toBeNull();
    expect(passwordLengthError("a".repeat(72))).toBeNull();
    expect(passwordLengthError("a".repeat(73))).not.toBeNull();
  });
});
