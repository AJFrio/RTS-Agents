/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,html}",
    "./*.{js,html}"
  ],
  // Safelist dynamic classes used in JavaScript
  safelist: [
    // Provider colors
    'bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/50', 'hover:border-emerald-500/50',
    'bg-blue-500/20', 'text-blue-400', 'border-blue-500/50', 'hover:border-blue-500/50',
    'bg-purple-500/20', 'text-purple-400', 'border-purple-500/50', 'hover:border-purple-500/50',
    'bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/50', 'hover:border-cyan-500/50',
    // Provider border colors for service selection
    'border-emerald-500', 'bg-emerald-500/10',
    'border-blue-500', 'bg-blue-500/10',
    'border-purple-500', 'bg-purple-500/10',
    'border-cyan-500', 'bg-cyan-500/10',
    // Status colors
    'bg-green-500/20', 'text-green-400',
    'bg-yellow-500/20', 'text-yellow-400',
    'bg-red-500/20', 'text-red-400',
    'bg-gray-500/20', 'text-gray-400',
    // Modal backgrounds
    'bg-blue-900/30', 'bg-emerald-900/30', 'bg-cyan-900/30',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d7fe',
          300: '#a5b8fc',
          400: '#818cf8',
          500: '#667eea',
          600: '#5a67d8',
          700: '#4c51bf',
          800: '#434190',
          900: '#3c366b',
        },
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
      }
    },
  },
  plugins: [],
}
