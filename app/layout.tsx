import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "TACO ERP — TnAcademy",
  description: "TnAcademy 백오피스 ERP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: 브라우저 확장프로그램이 html/body에 주입하는 속성 등
    // 앱 외부 요인으로 인한 hydration 경고를 무시 (앱 내부 포맷은 결정적으로 처리됨)
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard Variable — public/ 정적 서빙(DESIGN.md §R2·§3). 번들 제외로 빌드 IO 절감.
            원본: node_modules/pretendard (npm), 갱신 시 public/fonts/pretendard/ 재복사. */}
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
