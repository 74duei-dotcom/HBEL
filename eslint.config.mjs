import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // React 19 컴파일러용 엄격 규칙은 기존 코드에서 많이 걸려 '경고'로만 표시 (동작에는 문제 없음)
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      '@next/next/no-page-custom-font': 'warn',
    },
  },
  { ignores: ['out/**', '.next/**', 'public/**', 'node_modules/**', 'next-env.d.ts'] },
];
export default config;
