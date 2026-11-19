import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", ".next-e2e/**", ".next-redesign*/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
