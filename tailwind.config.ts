import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // リスクレベル色
        "risk-red": "#dc2626",
        "risk-orange": "#ea580c",
        "risk-yellow": "#ca8a04",
        "risk-green": "#16a34a",
        "risk-gray": "#6b7280",
      },
    },
  },
  plugins: [],
};
export default config;
