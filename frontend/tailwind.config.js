/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0e1a',
        surface: '#0e1425',
        card: '#121a2e',
        line: '#1e293b',
        muted: '#64748b',
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
