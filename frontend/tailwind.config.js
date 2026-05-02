/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic color tokens. Hex values below are the dark-theme defaults; when the
        // root has `class="light"` the CSS in index.css remaps them to light equivalents
        // via CSS variables.
        ink: 'rgb(var(--ink) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        elev: 'rgb(var(--elev) / <alpha-value>)',
        accent: '#6366f1',
        good: '#10b981',
        warn: '#f59e0b',
        bad: '#ef4444',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px 0 rgb(0 0 0 / 0.1)',
        card: '0 4px 12px -2px rgb(0 0 0 / 0.3), 0 2px 6px -1px rgb(0 0 0 / 0.2)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Inter', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
