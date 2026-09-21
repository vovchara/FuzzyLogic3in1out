import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,html}"],
  theme: {
    extend: {
      colors: {
        // Graphite carries the chrome, brand (teal) marks everything the
        // inference is currently doing: active step, current value, primary
        // actions. Term colours stay owned by the system definitions.
        graphite: {
          50: "#f6f7f8",
          100: "#eceef0",
          200: "#d8dce0",
          300: "#b6bdc4",
          400: "#8b959f",
          500: "#6b757f",
          600: "#545c65",
          700: "#434a52",
          800: "#2b3137",
          900: "#1b1f24",
        },
        brand: {
          50: "#effcf9",
          100: "#d3f6ef",
          200: "#a8ecdf",
          300: "#6edbc9",
          400: "#35c2ae",
          500: "#16a694",
          600: "#0d8578",
          700: "#0f6a61",
          800: "#11544e",
          900: "#123f3b",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
