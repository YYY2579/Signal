/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#ffffff",
        panel: "#f9fafb",
        line: "#e5e7eb",
        ink: "#111827",
        "ink-2": "#1f2937",
        muted: "#6b7280",
        faint: "#9ca3af",
        accent: "#6366f1",
        "accent-strong": "#4f46e5",
        "accent-soft": "#eef4ff",
        violet: "#8b5cf6",
        success: "#22c55e",
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
        card: "12px",
        btn: "8px",
        field: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(17, 24, 39, 0.04)",
        "card-hover": "0 12px 28px rgba(17, 24, 39, 0.08)",
        toolbar: "0 -4px 20px rgba(17, 24, 39, 0.05)",
      },
    },
  },
  plugins: [],
};
