/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./js/**/*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "canvas": "#F8FAFC",
        "surface": "#FFFFFF",
        "surface-tint": "#F0F7FD",
        "brand-dark": "#0F172A",
        "brand-slate": "#1E293B",
        "brand-orange": "#EA580C",
        "brand-sky": "#E0F2FE",
        "gain": "#059669",
        "loss": "#DC2626"
      },
      fontFamily: {
        "serif": ["Newsreader", "Playfair Display", "Georgia", "serif"],
        "sans": ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"]
      }
    }
  },
  plugins: []
};
