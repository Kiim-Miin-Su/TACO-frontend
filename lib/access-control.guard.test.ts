// [TBO-79 G5 2026-07-30] actor 권한 판정에 raw role 리터럴이 되살아나지 않도록 고정한다.
//
//  배경: 78C4-4가 "잔존 raw role 비교는 전부 대상 사용자 판정이라 정당하다"로 닫혔는데,
//  재검증 결과 **거짓**이었다 — ApprovalsView의 `verifiedRole === 'super_admin'`와
//  lib/tasks.ts의 `role === 'instructor'`는 로그인 actor의 권한 판정이었다.
//  CAPABILITY_ROLES가 바뀌어도 리터럴 비교는 따라오지 않으므로 UI와 서버 인가가 갈라진다.
//
//  이 테스트는 파일을 읽어 검사한다. 판정 헬퍼가 사는 곳(access-control·roles·useAccountAccess)과
//  **대상 사용자**의 role을 보는 곳(의도적 예외)만 허용한다.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

/** 판정 헬퍼의 정의 자리 — 여기서는 리터럴 비교가 곧 정의다. */
const HELPER_FILES = new Set([
  "lib/access-control.ts",
  "lib/roles.ts",
  "lib/useAccountAccess.ts",
]);

/**
 * 대상 사용자(actor 아님)의 role을 보는 의도적 비교. 새로 추가할 땐 왜 actor 판정이 아닌지
 * 한 줄로 적을 것 — 적을 수 없으면 capability로 바꿔야 한다는 신호다.
 */
const TARGET_ROLE_EXCEPTIONS: Record<string, string> = {
  "features/admin/UserDetailView.tsx": "수정·해지 대상 사용자가 대표인지 판정(actor는 hasCapability로 별도 확인)",
  "features/admin/CreateStaffModal.tsx": "폼 입력값(생성할 계정의 role)에 따른 조건부 입력 — 인가 아님",
  "lib/domain/signup-form.ts": "가입 신청서가 **요청한** role 검증 — BE canDecideSignupRole 대칭",
  "lib/domain/schedule-resources.ts": "일정 리소스 소유자의 role 표시 라벨 — 인가 아님",
  "lib/queries/schedule.ts": "리소스 목록 필터(소유자 role) — 인가 아님",
};

/**
 * `super_admin`은 role 외의 의미가 없어 어디서 비교하든 잡는다.
 * 나머지는 캘린더의 resource 차원("instructor" owner/dim 등)과 어휘가 겹치므로,
 * **role을 담은 식**과의 비교일 때만 잡는다.
 */
const UNAMBIGUOUS_ROLE_LITERALS = ["super_admin"];
const CONTEXTUAL_ROLE_LITERALS = ["manager", "admin", "instructor"];
const ROLE_BEARING = /(^|[^A-Za-z])[A-Za-z.?[\]]*[Rr]ole[A-Za-z]*\s*$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (["node_modules", ".next", ".git", "public", ".cache"].includes(name)) return [];
    const child = resolve(dir, name);
    if (statSync(child).isDirectory()) return sourceFiles(child);
    if (!/\.(ts|tsx)$/.test(child)) return [];
    if (/\.(test|spec)\.tsx?$/.test(child)) return [];
    return [child];
  });
}

describe("[TBO-79 G5] actor 권한 판정은 capability로만", () => {
  it("raw role 리터럴 비교는 헬퍼 정의부와 문서화된 대상-role 예외에만 존재한다", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const relative = file.slice(ROOT.length + 1);
      if (HELPER_FILES.has(relative) || TARGET_ROLE_EXCEPTIONS[relative]) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, "");
        for (const role of UNAMBIGUOUS_ROLE_LITERALS) {
          const compared = new RegExp(`[!=]==?\\s*['"\`]${role}['"\`]|['"\`]${role}['"\`]\\s*[!=]==?`).test(code);
          const included = new RegExp(`includes\\(\\s*['"\`]${role}['"\`]`).test(code);
          if (compared || included) offenders.push(`${relative}:${index + 1}  ${line.trim().slice(0, 110)}`);
        }
        for (const role of CONTEXTUAL_ROLE_LITERALS) {
          const match = new RegExp(`([^;{}()]*?)\\s*[!=]==?\\s*['"\`]${role}['"\`]`).exec(code);
          if (match && ROLE_BEARING.test(match[1])) {
            offenders.push(`${relative}:${index + 1}  ${line.trim().slice(0, 110)}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("예외 목록은 실제 파일만 가리킨다(삭제된 파일이 면제로 남지 않게)", () => {
    const existing = new Set(sourceFiles(ROOT).map((file) => file.slice(ROOT.length + 1)));
    for (const relative of [...Object.keys(TARGET_ROLE_EXCEPTIONS), ...HELPER_FILES]) {
      expect(existing.has(relative)).toBe(true);
    }
  });
});
