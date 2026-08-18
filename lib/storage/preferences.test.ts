import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  booleanPreferenceCodec,
  preferenceKeys,
  readPreference,
  stringArrayPreferenceCodec,
  writePreference,
} from "./preferences";

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

describe("preferences storage", () => {
  let localStorage: MemoryStorage;

  beforeEach(() => {
    localStorage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates legacy boolean keys into the namespaced key", () => {
    localStorage.setItem("sidebarCollapsed", "1");

    const collapsed = readPreference(
      preferenceKeys.uiSidebarCollapsed,
      false,
      booleanPreferenceCodec,
      { legacyKeys: ["sidebarCollapsed"] },
    );

    expect(collapsed).toBe(true);
    expect(localStorage.getItem("sidebarCollapsed")).toBeNull();
    expect(localStorage.getItem(preferenceKeys.uiSidebarCollapsed)).toBe("true");
  });

  it("drops string-array values outside the allowlist", () => {
    writePreference(preferenceKeys.recentCountries, ["US", "NOPE", "KR"], stringArrayPreferenceCodec(["KR", "US"]));

    expect(readPreference(preferenceKeys.recentCountries, [], stringArrayPreferenceCodec(["KR", "US"]))).toEqual(["US", "KR"]);
  });
});
