import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          900: "#081c15",
          800: "#0b291e",
          700: "#113a2b",
          600: "#184e3b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
