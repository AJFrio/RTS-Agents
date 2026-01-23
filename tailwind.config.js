/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,html}",
    "./*.{js,html}"
  ],
  // Safelist dynamic classes used in JavaScript
  safelist: [
    // Provider colors - borders and backgrounds
    'border-emerald-500', 'bg-emerald-500/5', 'text-emerald-500',
    'border-primary', 'bg-primary/5', 'text-primary',
    'border-blue-500', 'bg-blue-500/5', 'text-blue-500',
    'border-cyan-500', 'bg-cyan-500/5', 'text-cyan-500',
    'border-orange-500', 'bg-orange-500/5', 'text-orange-500',
    // Provider hover states
    'hover:border-emerald-500', 'hover:border-primary', 'hover:border-blue-500',
    'hover:border-cyan-500', 'hover:border-orange-500',
    // Status colors
    'bg-primary', 'text-black',
    'border-emerald-500', 'text-emerald-500',
    'border-yellow-500', 'text-yellow-500',
    'border-red-500', 'text-red-500',
    'border-slate-600', 'text-slate-400',
    // Card hover
    'hover:border-primary',
  ],
  theme: {
    extend: {
      colors: {
        primary: "#93b8c5", // Light Blue/Cyan
        "primary-hover": "#7aa5b3",
        "background-light": "#F5F5F0",
        "background-dark": "#121212", // Matte Charcoal
        "sidebar-dark": "#0D0D0D",
        "card-dark": "#1A1A1A",
        "border-dark": "#2A2A2A",
      },
      fontFamily: {
        display: ["JetBrains Mono", "monospace"],
        sans: ["Plus Jakarta Sans", "Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "8px", // Modern rounded corners
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
