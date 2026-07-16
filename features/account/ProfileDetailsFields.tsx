"use client";

// [대표 추가요청 2026-07-16 ③] 프로필 상세 필드 **단일 컴포넌트** — 첫 로그인 통합 설정
//  (SecuritySettingsView forced)과 마이 페이지 프로필 변경(ProfileChangeModal)이 같은 필드
//  UI·검증 힌트·카탈로그 셀렉트를 재사용한다(사설 사본 금지 — 대표 재사용 규약).
//  · 직책(role)은 자기 결정 금지 필드 — 읽기 전용 표시만(roleLabel).
//  · 이메일 인증 버튼은 호출부가 emailAction으로 주입(강제 흐름=새 이메일 OTP, 모달=사전 인증).
//  · extended=true면 users 테이블의 나머지 수정 가능 컬럼(출신교·전공·출생연도)까지 렌더.
import { Field } from "@/components/ui";
import type { CatalogCountry } from "@/lib/api";

export type ProfileDetailsValues = {
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  timeZone: string;
  university?: string;
  major?: string;
  birthYear?: string; // 입력은 문자열 — 제출 시 Number 변환은 호출부 책임
};

export function ProfileDetailsFields({
  values,
  onPatch,
  countries,
  countriesPending = false,
  roleLabel,
  extended = false,
  requireAll = false,
  emailAction,
  emailHint,
  phoneHint,
}: {
  values: ProfileDetailsValues;
  /** 다중 필드 패치(국가 선택 시 시간대 자동 세팅 포함) — setState 병합은 호출부가 수행. */
  onPatch: (patch: Partial<ProfileDetailsValues>) => void;
  countries: CatalogCountry[];
  countriesPending?: boolean;
  /** 직책(role) 읽기 전용 표시 — 자기 결정 금지 필드라 편집 불가. */
  roleLabel?: string;
  /** users 테이블 확장 컬럼(출신교·전공·출생연도) 렌더 여부 — 첫 로그인 통합 설정에서 사용. */
  extended?: boolean;
  requireAll?: boolean;
  /** 이메일 필드 옆 인증 버튼(있으면 렌더) — 발송/재사용 상태는 호출부가 소유. */
  emailAction?: { label: string; disabled: boolean; onClick: () => void };
  emailHint?: string;
  phoneHint?: string;
}) {
  const countryInCatalog = !values.countryCode || countries.some((c) => c.code === values.countryCode);
  const tzInCatalog = !values.timeZone || countries.some((c) => c.timeZone === values.timeZone);
  const onCountrySelect = (code: string) => {
    const country = countries.find((c) => c.code === code);
    // 국가 선택 시 대표 시간대 자동 세팅(비우면 시간대 유지 — 별도 선택 가능).
    onPatch({ countryCode: code, ...(country ? { timeZone: country.timeZone } : {}) });
  };

  return (
    <>
      <Field label={requireAll ? "이름 *" : "이름"}>
        <input className="input w-full" required={requireAll} maxLength={50} value={values.name}
          onChange={(e) => onPatch({ name: e.target.value })} placeholder="김민선" />
      </Field>
      {roleLabel && (
        <Field label="직책" hint="직책(역할)은 본인이 변경할 수 없습니다.">
          <input className="input w-full" value={roleLabel} disabled readOnly />
        </Field>
      )}
      <Field label={requireAll ? "이메일 *" : "이메일"} hint={emailHint}>
        {emailAction ? (
          <div className="flex items-center gap-2">
            <input className="input min-w-0 flex-1" type="email" autoComplete="email" required={requireAll}
              maxLength={320} value={values.email} onChange={(e) => onPatch({ email: e.target.value })}
              placeholder="you@tnacademy.com" />
            <button type="button" className="btn btn-sm shrink-0" onClick={emailAction.onClick} disabled={emailAction.disabled}>
              {emailAction.label}
            </button>
          </div>
        ) : (
          <input className="input w-full" type="email" autoComplete="email" required={requireAll}
            maxLength={320} value={values.email} onChange={(e) => onPatch({ email: e.target.value })}
            placeholder="you@tnacademy.com" />
        )}
      </Field>
      <Field label={requireAll ? "휴대폰 *" : "연락처"} hint={phoneHint}>
        <input className="input w-full" type="tel" autoComplete="tel" required={requireAll} maxLength={20}
          placeholder="010-1234-5678" value={values.phone} onChange={(e) => onPatch({ phone: e.target.value })} />
      </Field>
      {/* [E0.5 ④] 자유 입력 폐지 — 카탈로그 토글 선택(국가 선택 시 시간대 자동 세팅) */}
      <Field label="국가" hint="선택하면 시간대가 자동 설정됩니다.">
        <select className="input w-full" value={values.countryCode} disabled={countriesPending}
          onChange={(e) => onCountrySelect(e.target.value)}>
          <option value="">선택 안 함</option>
          {!countryInCatalog && (
            <option value={values.countryCode}>{values.countryCode} (카탈로그 외 — 변경 시 목록에서 선택)</option>
          )}
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag ? `${country.flag} ` : ""}{country.nameKo} ({country.code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="시간대" hint="카탈로그 시간대 중에서 선택합니다.">
        <select className="input w-full" value={values.timeZone} disabled={countriesPending}
          onChange={(e) => onPatch({ timeZone: e.target.value })}>
          <option value="">선택 안 함</option>
          {!tzInCatalog && (
            <option value={values.timeZone}>{values.timeZone} (카탈로그 외 — 변경 시 목록에서 선택)</option>
          )}
          {countries.map((country) => (
            <option key={country.code} value={country.timeZone}>
              {country.timeZone} — {country.nameKo}
            </option>
          ))}
        </select>
      </Field>
      {extended && (
        <>
          <Field label="출신 대학">
            <input className="input w-full" maxLength={100} value={values.university ?? ""}
              onChange={(e) => onPatch({ university: e.target.value })} placeholder="한국대학교" />
          </Field>
          <Field label="전공">
            <input className="input w-full" maxLength={100} value={values.major ?? ""}
              onChange={(e) => onPatch({ major: e.target.value })} placeholder="수학교육" />
          </Field>
          <Field label="출생연도">
            <input className="input w-full" type="number" min={1900} max={2100} value={values.birthYear ?? ""}
              onChange={(e) => onPatch({ birthYear: e.target.value })} placeholder="1985" />
          </Field>
        </>
      )}
    </>
  );
}
