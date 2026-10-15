/** @type {import('next').NextConfig} */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

const nextConfig = {
  // 정적 파일(out 폴더)로 내보내기: GitHub Pages·PC 도우미(localhost)·APK(Capacitor) 어디든 그대로 올릴 수 있음
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // 어떤 버전이 배포되어 있는지 화면에서 확인할 수 있도록 (설정 > 음성)
  env: { NEXT_PUBLIC_BUILD_ID: (process.env.GITHUB_SHA || 'dev').slice(0, 7) },
  // GitHub Pages 주소가 https://아이디.github.io/english-library/ 처럼 하위 경로일 때 사용
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
