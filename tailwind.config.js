/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1117",
        background: "#0f1117",
        surface: "#1a1d27",
        card: "#21253a",
        border: "#2e3350",
        accent: "#6c63ff",
        accent2: "#00d4aa",
        warn: "#f59e0b",
        danger: "#ef4444",
        muted: "#8892a4",
      },
    },
  },
  plugins: [],
};
