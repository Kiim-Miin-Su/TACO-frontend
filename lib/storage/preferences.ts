"use client";

export type PreferenceCodec<T> = {
  serialize: (value: T) => string;
  deserialize: (raw: string) => T;
};

export const preferenceKeys = {
  uiSidebarCollapsed: "taco.ui.sidebarCollapsed",
  calendarView: "taco.calendar.view",
  calendarColorBy: "taco.calendar.colorBy",
  calendarCompactCols: "taco.calendar.compactCols",
  calendarKstFixed: "taco.calendar.kstFixed",
  recentCountries: "taco.calendar.recentCountries",
  paymentsView: "taco.payments.view",
  debugEnabled: "taco.debug.enabled",
} as const;

export type ReadOptions = { legacyKeys?: readonly string[] };

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

export const jsonPreferenceCodec = <T,>(): PreferenceCodec<T> => ({
  serialize: (value) => JSON.stringify(value),
  deserialize: (raw) => JSON.parse(raw) as T,
});

export const booleanPreferenceCodec: PreferenceCodec<boolean> = {
  serialize: (value) => JSON.stringify(value),
  deserialize: (raw) => {
    if (raw === "1") return true;
    if (raw === "0") return false;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "boolean") throw new Error("Invalid boolean preference");
    return parsed;
  },
};

export const enumPreferenceCodec = <T extends string>(allowed: readonly T[]): PreferenceCodec<T> => ({
  serialize: (value) => {
    if (!allowed.includes(value)) throw new Error("Invalid enum preference");
    return JSON.stringify(value);
  },
  deserialize: (raw) => {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "string" || !allowed.includes(parsed as T)) {
      throw new Error("Invalid enum preference");
    }
    return parsed as T;
  },
});

export const stringArrayPreferenceCodec = (allowed?: readonly string[]): PreferenceCodec<string[]> => ({
  serialize: (value) => JSON.stringify(value.filter((x) => typeof x === "string" && (!allowed || allowed.includes(x)))),
  deserialize: (raw) => {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Invalid string array preference");
    return parsed.filter((x): x is string => typeof x === "string" && (!allowed || allowed.includes(x)));
  },
});

export function readPreference<T>(
  key: string,
  fallback: T,
  codec: PreferenceCodec<T> = jsonPreferenceCodec<T>(),
  options: ReadOptions = {},
): T {
  const s = storage();
  if (!s) return fallback;
  try {
    let raw = s.getItem(key);
    let legacyKey: string | null = null;
    if (raw == null) {
      for (const candidate of options.legacyKeys ?? []) {
        const legacy = s.getItem(candidate);
        if (legacy != null) {
          raw = legacy;
          legacyKey = candidate;
          break;
        }
      }
    }
    if (raw == null) return fallback;
    const value = codec.deserialize(raw);
    if (legacyKey) {
      writePreference(key, value, codec);
      s.removeItem(legacyKey);
    }
    return value;
  } catch {
    removePreference(key);
    return fallback;
  }
}

export function writePreference<T>(
  key: string,
  value: T,
  codec: PreferenceCodec<T> = jsonPreferenceCodec<T>(),
): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, codec.serialize(value));
  } catch {
    /* storage unavailable or quota exceeded */
  }
}

export function removePreference(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function resetPreferences(): void {
  const s = storage();
  if (!s) return;
  Object.values(preferenceKeys).forEach((key) => removePreference(key));
}

export function debugPreferenceEnabled(): boolean {
  return readPreference(preferenceKeys.debugEnabled, false, booleanPreferenceCodec, { legacyKeys: ["taco_debug"] });
}
