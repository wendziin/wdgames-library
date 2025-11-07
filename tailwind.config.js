/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}" // Escaneia arquivos HTML e JS na pasta public
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue': '#0a192f',
        'brand-green': '#64ffda',
      }
    },
  },
  plugins: [
    require('@tailwindcss/aspect-ratio'), // Plugin útil para capas de jogos
  ],
}
