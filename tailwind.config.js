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
        "canvas": "#0D1527",
        "navy": "#14213D",
        "card": "#14213D",
        "card-elevated": "#1C2C4E",
        "card-border": "rgba(244, 237, 224, 0.14)",
        "cream": "#F4EDE0",
        "cream-hover": "#E8DFCF",
        "gain": "#7AD9A5",
        "loss": "#F87171"
      },
      fontFamily: {
        "serif": ["Newsreader", "Playfair Display", "Georgia", "serif"],
        "sans": ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"]
      }
    }
  },
  plugins: []
};
