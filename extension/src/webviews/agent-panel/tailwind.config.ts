import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./index.tsx", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        zinc: {
          900: "#09090b",
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
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        expandCollapse: {
          from: { maxHeight: "0", opacity: "0" },
          to: { maxHeight: "500px", opacity: "1" },
        },
        pulse: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.05)" },
        },
      },
      animation: {
        blink: "blink 1s step-end infinite",
        fadeIn: "fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        expandCollapse: "expandCollapse 0.2s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
