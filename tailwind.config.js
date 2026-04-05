import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontSize: {
        base: "14px",
      },
      keyframes: {
        'bounce-in': {
          '0%': { transform: 'scale(0.95) translateX(10px)', opacity: '0' },
          '50%': { transform: 'scale(1.02) translateX(-2px)' },
          '100%': { transform: 'scale(1) translateX(0)', opacity: '1' },
        },
        'fade-out': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        }
      },
      animation: {
        'bounce-in': 'bounce-in 0.35s ease-out forwards',
        'fade-out': 'fade-out 0.2s ease-in forwards',
      },
    }
  },
  plugins: [
    typography,
  ],
}