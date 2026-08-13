import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // 상위 workspace의 빈 lockfile을 root로 오인하면 dev watcher가 모든 sibling repo를 감시해 EMFILE이 난다.
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [{ source: '/(.*)', headers: [...SECURITY_HEADERS] }];
  },
  // 추후 데스크탑(Electron/Tauri) 전환을 위해 정적 export로 바꿀 수 있도록 여지를 둡니다.
  // output: 'export',
  async rewrites() {
    // 브라우저 번들에는 backend origin을 노출하지 않는다. 기존 NEXT_PUBLIC 값은 배포 전환기
    // 호환만 유지하고 신규 production 설정은 server-only API_URL을 사용한다.
    const api = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
