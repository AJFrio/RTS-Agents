/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,html}",
    "./*.{js,html}"
  ],
  // Safelist dynamic classes used in JavaScript
  safelist: [
    // Provider neutral styles
    'border-neutral-300', 'bg-neutral-400/10', 'text-neutral-600', 'dark:text-neutral-400',
    // Status colors
    'border-emerald-500', 'text-emerald-600', 'dark:text-emerald-400', 'bg-emerald-500/10',
    'border-amber-500', 'text-amber-600', 'dark:text-amber-400', 'bg-amber-500/10',
    'border-red-500', 'text-red-600', 'dark:text-red-400', 'bg-red-500/10',
    'border-neutral-400', 'text-neutral-500', 'dark:text-neutral-500', 'bg-neutral-400/10',
  ],
  theme: {
    extend: {
      colors: {
        // Accent = inverted neutral (light theme). Dark theme overrides at usage sites.
        primary: "#171717", // near-black accent (buttons, active nav)
        "background-light": "#fafafa", // canvas background (light)
        "background-dark": "#0f0f0f", // canvas background (dark)
        "sidebar-light": "#f4f4f5", // sidebar surface (light)
        "sidebar-dark": "#181818", // sidebar surface (dark)
        "card-light": "#ffffff",
        "card-dark": "#1e1e1e",
        "inset-light": "#f4f4f5", // inset wells (light)
        "inset-dark": "#141414", // inset wells (dark)
        "border-light": "#e5e5e5", // hairline border (light)
        "border-dark": "#262626", // hairline border (dark)
        "border-strong-light": "#d4d4d4",
        "border-strong-dark": "#404040",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "-apple-system", "sans-serif"],
        sans: ["Plus Jakarta Sans", "Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px", // cards, modals, composer
        sm: "6px", // inputs, controls
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
