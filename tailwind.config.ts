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
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          hover: "rgb(var(--brand-hover) / <alpha-value>)",
          deep: "rgb(var(--brand-deep) / <alpha-value>)",
        },
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--bg-surface-2) / <alpha-value>)",
        "border-token": "rgb(var(--border) / <alpha-value>)",
      },
      // `base` is deliberately NOT registered under `colors`: that would also
      // generate a `text-base` color utility, which collides with Tailwind's
      // core `text-base` font-size and silently paints text near-black. It is
      // only ever used as a background/gradient, so register it just there.
      backgroundColor: {
        base: "rgb(var(--bg-base) / <alpha-value>)",
      },
      gradientColorStops: {
        base: "rgb(var(--bg-base) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-bebas)", "system-ui", "sans-serif"],
        condensed: ["var(--font-condensed)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
