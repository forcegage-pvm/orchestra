import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./index.tsx", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        zinc: {
          900: "#18181b",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      keyframes: {
        blink: {
          "50%": { opacity: "0" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        blink: "blink 1s step-end infinite",
        fadeIn: "fadeIn 0.3s ease-in",
      },
    },
  },
  plugins: [],
} satisfies Config;
