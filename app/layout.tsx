import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import Providers from "./providers";
import { ACADEMY_BRAND } from "@/lib/brand";

const pretendard = localFont({
  src: "../public/fonts/pretendard/woff2/PretendardVariable.woff2",
  display: "swap",
  style: "normal",
  weight: "45 920",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  applicationName: ACADEMY_BRAND.applicationName,
  title: ACADEMY_BRAND.applicationName,
  description: ACADEMY_BRAND.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: 브라우저 확장프로그램이 html/body에 주입하는 속성 등
    // 앱 외부 요인으로 인한 hydration 경고를 무시 (앱 내부 포맷은 결정적으로 처리됨)
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
