import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        lejon: {
          blue: "#2D348B",
          navy: "#142653",
          orange: "#F0811E",
          cream: "#FFF9F3",
        },
      },
    },
  },
  plugins: [],
};

export default config;
