/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbff',
          100: '#d8f4ff',
          200: '#b5eaff',
          300: '#7fdbff',
          400: '#3ec4f7',
          500: '#15a4dd',
          600: '#0a83bb',
          700: '#0c6897',
          800: '#11557b',
          900: '#134868',
        },
      },
    },
  },
  plugins: [],
}
