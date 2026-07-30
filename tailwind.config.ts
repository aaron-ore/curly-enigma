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
        brand: {
          blue: "#0066FF",
          green: "#9CFF5F",
          light: "#E8F4FD",
          glass: "rgba(232, 244, 253, 0.7)",
        },
      },
      backdropBlur: {
        glass: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
