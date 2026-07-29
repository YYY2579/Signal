/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#ffffff",
        panel: "#fafafa",
        line: "#f0f0f0",
        ink: "#111827",
        "ink-2": "#1f2937",
        muted: "#6b7280",
        faint: "#9ca3af",
        accent: "#2563eb",
        "accent-soft": "#eff6ff",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Source Han Sans CN",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "8px",
        btn: "6px",
      },
    },
  },
  plugins: [],
};
