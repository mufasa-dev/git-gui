/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // pega seus componentes Solid
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
