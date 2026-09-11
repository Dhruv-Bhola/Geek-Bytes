import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Institutional / government-grade palette. Keep as the single
        // source of truth for color — do not hardcode hex values in pages.
        navy: {
          950: "#0A1B30",
          900: "#0F2440",
          800: "#163256",
          700: "#1E4270",
          600: "#2B5590",
        },
        surface: {
          bg: "#F3F5F8",      // page background
          card: "#FFFFFF",    // card background
          border: "#E1E5EB",  // hairline borders
          muted: "#F7F8FA",   // table stripe / subtle fill
        },
        ink: {
          900: "#101828",
          700: "#344054",
          500: "#667085",
          400: "#98A2B3",
        },
        status: {
          verified: "#0F8A4B",
          verifiedBg: "#EAF7EF",
          review: "#B45309",
          reviewBg: "#FFF6E5",
          critical: "#B3261E",
          criticalBg: "#FCEAE9",
          info: "#2B5590",
          infoBg: "#EAF0FA",
        },
      },
      fontFamily: {
        sans: [
          "Times New Roman",
          "Times",
          "Liberation Serif",
          "serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 1px rgba(16, 24, 40, 0.04)",
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
