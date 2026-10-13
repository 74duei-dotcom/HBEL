/** @type {import('next').NextConfig} */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

const nextConfig = {
  // 정적 파일(out 폴더)로 내보내기: GitHub Pages·PC 도우미(localhost)·APK(Capacitor) 어디든 그대로 올릴 수 있음
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // GitHub Pages 주소가 https://아이디.github.io/english-library/ 처럼 하위 경로일 때 사용
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
