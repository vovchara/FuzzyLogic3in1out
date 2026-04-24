import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,html}"],
  theme: {
    extend: {
      colors: {
        term: {
          low: "#e74c3c",
          medium: "#3498db",
          high: "#27ae60",
          veryLow: "#9b59b6",
          veryHigh: "#f39c12",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
