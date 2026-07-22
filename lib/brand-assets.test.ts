import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACADEMY_BRAND } from "@/lib/brand";

const workspaceFile = (path: string) => resolve(process.cwd(), path);

describe("TN Academy brand assets", () => {
  it("keeps the visible mark on the repository-owned canonical SVG", () => {
    const svg = readFileSync(workspaceFile("public/brand/tn-mark.svg"), "utf8");

    expect(ACADEMY_BRAND.markPath).toBe("/brand/tn-mark.svg");
    expect(svg).toContain("TN Academy");
    expect(svg).toContain(ACADEMY_BRAND.colors.charcoal);
    expect(svg).toContain(ACADEMY_BRAND.colors.bronze);
    expect(svg).not.toMatch(/(?:href|src)=["']https?:\/\//i);
    expect(svg).not.toContain("<script");
  });

  it("ships an actual ICO at the App Router favicon convention", () => {
    const favicon = readFileSync(workspaceFile("app/favicon.ico"));

    expect([...favicon.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(favicon.length).toBeGreaterThan(256);
  });

  it("ships a PNG apple touch icon derived from the same mark", () => {
    const appleIcon = readFileSync(workspaceFile("app/apple-icon.png"));

    expect([...appleIcon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
