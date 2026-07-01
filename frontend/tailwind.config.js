/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  // Disable preflight (CSS reset) so existing custom CSS is not affected
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#060e20',
          mid: '#0d1b36',
          card: '#111f3a',
        },
        gold: {
          DEFAULT: '#f59e0b',
          dark: '#d97706',
        },
        primary: '#3b82f6',
      },
      boxShadow: {
        card: '0 4px 24px rgba(6,14,32,0.10), 0 1px 4px rgba(6,14,32,0.06)',
        lift: '0 12px 40px rgba(6,14,32,0.16), 0 2px 8px rgba(6,14,32,0.08)',
      },
    },
  },
  plugins: [],
};
