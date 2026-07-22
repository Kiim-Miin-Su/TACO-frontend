import { describe, expect, it } from "vitest";
import { safeLogValue, safeUrlForLog } from "./log-redaction";

describe("브라우저 로그 개인정보 마스킹", () => {
  it("회원가입 요청의 계정·인적·RRN 필드를 원문으로 남기지 않는다", () => {
    const raw = {
      webId: "new_staff",
      name: "신규 강사",
      email: "new@example.com",
      password: "password123",
      phone: "010-1234-5678",
      university: "서울대학교",
      major: "교육학",
      rrn: "950101-1234567",
      role: "instructor",
    };
    const serialized = JSON.stringify(safeLogValue(raw));

    expect(serialized).not.toContain("new_staff");
    expect(serialized).not.toContain("신규 강사");
    expect(serialized).not.toContain("new@example.com");
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("950101-1234567");
    expect(serialized).not.toContain("서울대학교");
    expect(serialized).toContain('"role":"instructor"');
  });

  it("키 없는 문자열과 URL query의 이메일·전화·RRN도 마스킹한다", () => {
    expect(safeLogValue("new@example.com 010-1234-5678 950101-1234567"))
      .toBe("[redacted-email] [redacted-phone] [redacted-rrn]");
    expect(safeUrlForLog("/signup?email=new@example.com&rrn=950101-1234567"))
      .toBe("/signup?email=%5Bredacted%5D&rrn=%5Bredacted%5D");
  });
});
