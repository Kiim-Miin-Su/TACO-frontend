import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import Providers from "./providers";
import { ACADEMY_BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  applicationName: ACADEMY_BRAND.applicationName,
  title: ACADEMY_BRAND.applicationName,
  description: ACADEMY_BRAND.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: 브라우저 확장프로그램이 html/body에 주입하는 속성 등
    // 앱 외부 요인으로 인한 hydration 경고를 무시 (앱 내부 포맷은 결정적으로 처리됨)
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard Variable — OFL asset을 public/에서 직접 정적 서빙(DESIGN.md §R2·§3).
            빌드/runtime npm dependency 없이 CSS와 woff2를 함께 버전 관리한다. */}
        <link
          rel="preload"
          href="/fonts/pretendard/woff2/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href="/fonts/pretendard/pretendardvariable.css" />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
